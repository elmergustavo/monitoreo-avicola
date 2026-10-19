import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Subscription } from 'rxjs';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  TelemetryStreamService,
  type EventMessage,
  type ReadingMessage,
} from '../telemetry/telemetry-stream.service.js';
import { dueFollowUps, evaluateDevice, RECOVERY_MIN, type WindowStats } from './alert-rules.js';
import { AlertsService, deviceConfig } from './alerts.service.js';

const TICK_MS = 60_000;
const MINUTE = 60_000;

interface WindowRow {
  heat_count: number;
  heat_min: number | null;
  heat_max: number | null;
  heat_first: Date | null;
  cold_count: number;
  cold_min: number | null;
  cold_max: number | null;
  cold_first: Date | null;
  recent_count: number;
  recent_min: number | null;
  recent_max: number | null;
  recent_first: Date | null;
}

/**
 * Turns telemetry into alerts:
 *  - live: ESP32 events open/resolve alerts as they arrive;
 *  - every minute: offline sheds, sustained heat/cold, recovery, reminders and escalation.
 * Runs in a single API instance (Dokploy deploys one replica).
 */
@Injectable()
export class AlertEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlertEngineService.name);
  private subscription?: Subscription;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    private readonly stream: TelemetryStreamService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  onModuleInit() {
    this.subscription = this.stream.messages$.subscribe((message) => {
      const work =
        message.type === 'event'
          ? this.onEvent(message)
          : message.type === 'reading'
            ? this.onReading(message)
            : null;
      work?.catch((error: unknown) =>
        this.logger.error('Could not process telemetry for alerts', error as Error),
      );
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  /** ESP32 events map directly to alerts. */
  async onEvent({ deviceId, event }: EventMessage) {
    switch (event.type) {
      case 'heat_alert_no_irrigation':
        await this.alerts.open(deviceId, 'heat_no_irrigation', { temperature: event.temperature });
        break;
      case 'prolonged_irrigation_alert':
        await this.alerts.open(deviceId, 'prolonged_irrigation', {
          temperature: event.temperature,
          metadata: event.durationMin !== null ? { durationMin: event.durationMin } : undefined,
        });
        break;
      case 'sensor_error':
        await this.alerts.open(deviceId, 'sensor_error');
        break;
      case 'irrigation_on':
        await this.alerts.resolve(deviceId, 'heat_no_irrigation', 'Se encendió el riego');
        break;
      case 'irrigation_off':
        await this.alerts.resolve(deviceId, 'prolonged_irrigation', 'Se apagó el riego');
        break;
    }
  }

  /** Any reading proves the shed is online and the sensor works. */
  async onReading({ deviceId, reading }: ReadingMessage) {
    await this.alerts.resolve(deviceId, 'device_offline', 'Volvió a enviar datos');
    await this.alerts.resolve(deviceId, 'sensor_error', 'El sensor volvió a dar lecturas');
    if (reading.irrigation) {
      await this.alerts.resolve(deviceId, 'heat_no_irrigation', 'Se encendió el riego');
    }
    await this.alerts.notePeak(deviceId, reading.temperature);
  }

  @Interval('alert-engine', TICK_MS)
  async scheduledTick() {
    // Tests drive the engine with tick() and a fixed clock.
    if (this.config.get('NODE_ENV', { infer: true }) === NodeEnv.Test) return;
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.tick(new Date());
    } catch (error) {
      this.logger.error('Alert engine tick failed', error as Error);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * One evaluation pass over every active shed and unresolved alert.
   * `deviceIds` limits it to some sheds (used by tests).
   */
  async tick(now: Date, deviceIds?: string[]) {
    const devices = await this.prisma.device.findMany({
      where: { active: true, id: deviceIds ? { in: deviceIds } : undefined },
      include: { settings: true },
    });

    for (const device of devices) {
      const { thresholds, rules } = deviceConfig(device.settings);
      const [windows, unresolved] = await Promise.all([
        this.windows(device.id, now, rules.sustainedHeatMin, rules.sustainedColdMin),
        this.alerts.unresolvedKinds(device.id),
      ]);
      const decisions = evaluateDevice(
        {
          lastSeenAt: device.lastSeenAt,
          thresholds,
          rules,
          heatWindow: windows.heat,
          coldWindow: windows.cold,
          recoveryWindow: windows.recent,
          unresolved,
        },
        now,
      );
      for (const { kind, temperature, metadata } of decisions.open) {
        await this.alerts.open(device.id, kind, { temperature, metadata });
      }
      for (const { kind, resolution } of decisions.resolve) {
        await this.alerts.resolve(device.id, kind, resolution);
      }
    }

    for (const alert of await this.alerts.findUnresolved(deviceIds)) {
      const { rules } = deviceConfig(alert.device.settings);
      const due = dueFollowUps(alert, rules, now);
      if (due.escalate) await this.alerts.escalate(alert.id);
      else if (due.remind) await this.alerts.remind(alert.id);
    }
  }

  private async windows(deviceId: string, now: Date, heatMin: number, coldMin: number) {
    const heatStart = new Date(now.getTime() - heatMin * MINUTE);
    const coldStart = new Date(now.getTime() - coldMin * MINUTE);
    const recentStart = new Date(now.getTime() - RECOVERY_MIN * MINUTE);
    const earliest = new Date(
      Math.min(heatStart.getTime(), coldStart.getTime(), recentStart.getTime()),
    );

    const [row] = await this.prisma.$queryRaw<WindowRow[]>`
      SELECT
        count(*) FILTER (WHERE created_at >= ${heatStart})::int AS heat_count,
        min(temperature) FILTER (WHERE created_at >= ${heatStart})::float8 AS heat_min,
        max(temperature) FILTER (WHERE created_at >= ${heatStart})::float8 AS heat_max,
        min(created_at) FILTER (WHERE created_at >= ${heatStart}) AS heat_first,
        count(*) FILTER (WHERE created_at >= ${coldStart})::int AS cold_count,
        min(temperature) FILTER (WHERE created_at >= ${coldStart})::float8 AS cold_min,
        max(temperature) FILTER (WHERE created_at >= ${coldStart})::float8 AS cold_max,
        min(created_at) FILTER (WHERE created_at >= ${coldStart}) AS cold_first,
        count(*) FILTER (WHERE created_at >= ${recentStart})::int AS recent_count,
        min(temperature) FILTER (WHERE created_at >= ${recentStart})::float8 AS recent_min,
        max(temperature) FILTER (WHERE created_at >= ${recentStart})::float8 AS recent_max,
        min(created_at) FILTER (WHERE created_at >= ${recentStart}) AS recent_first
      FROM readings
      WHERE device_id = ${deviceId}::uuid AND created_at >= ${earliest} AND created_at <= ${now}`;

    const stats = (
      count: number,
      min: number | null,
      max: number | null,
      firstAt: Date | null,
    ): WindowStats => ({
      count,
      min,
      max,
      firstAt,
    });
    return {
      heat: stats(row.heat_count, row.heat_min, row.heat_max, row.heat_first),
      cold: stats(row.cold_count, row.cold_min, row.cold_max, row.cold_first),
      recent: stats(row.recent_count, row.recent_min, row.recent_max, row.recent_first),
    };
  }
}
