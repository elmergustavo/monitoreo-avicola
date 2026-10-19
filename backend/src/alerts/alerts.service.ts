import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DEFAULT_SETTINGS } from '../devices/devices.service.js';
import {
  Prisma,
  type Alert,
  type AlertKind,
  type AlertStatus,
  type DeviceSettings,
} from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelemetryStreamService } from '../telemetry/telemetry-stream.service.js';
import { ALERT_LABELS, buildAlertMessage } from './alert-messages.js';
import { DEFAULT_ALERT_RULES, SEVERITY, type AlertRules, type Thresholds } from './alert-rules.js';

const UNRESOLVED: AlertStatus[] = ['open', 'acknowledged'];

const alertInclude = {
  device: { include: { settings: true } },
  acknowledgedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} satisfies Prisma.AlertInclude;

type AlertWithRelations = Prisma.AlertGetPayload<{ include: typeof alertInclude }>;

type Phase = 'alert_opened' | 'alert_reminder' | 'alert_escalated' | 'alert_resolved';

/** Thresholds and alert rules of a shed, with defaults when it has no settings row. */
export function deviceConfig(settings: DeviceSettings | null): {
  thresholds: Thresholds;
  rules: AlertRules;
} {
  if (!settings) return { thresholds: DEFAULT_SETTINGS, rules: DEFAULT_ALERT_RULES };
  return {
    thresholds: {
      tempMin: settings.tempMin.toNumber(),
      tempMax: settings.tempMax.toNumber(),
      tempAlert: settings.tempAlert.toNumber(),
    },
    rules: {
      offlineAfterMin: settings.offlineAfterMin,
      sustainedHeatMin: settings.sustainedHeatMin,
      sustainedColdMin: settings.sustainedColdMin,
      reminderEveryMin: settings.reminderEveryMin,
      escalateAfterMin: settings.escalateAfterMin,
    },
  };
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly stream: TelemetryStreamService,
  ) {}

  /**
   * Opens an alert unless one of the same kind is already unresolved for the
   * shed (enforced by a partial unique index). Returns null in that case.
   */
  async open(
    deviceId: string,
    kind: AlertKind,
    details: { temperature?: number | null; metadata?: Prisma.InputJsonValue } = {},
  ): Promise<AlertWithRelations | null> {
    let alert: AlertWithRelations;
    try {
      alert = await this.prisma.alert.create({
        data: {
          deviceId,
          kind,
          severity: SEVERITY[kind],
          triggerTemperature: details.temperature ?? null,
          peakTemperature: details.temperature ?? null,
          metadata: details.metadata,
        },
        include: alertInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (details.temperature != null) await this.notePeak(deviceId, details.temperature);
        return null;
      }
      throw error;
    }

    this.logger.log(`Alert opened: ${kind} on ${alert.device.name}`);
    this.publish(alert);
    await this.notify(alert, 'alert_opened');
    return alert;
  }

  /** Resolves the unresolved alert of this kind, if any. */
  async resolve(deviceId: string, kind: AlertKind, resolution: string, byUserId?: string) {
    const current = await this.prisma.alert.findFirst({
      where: { deviceId, kind, status: { in: UNRESOLVED } },
      select: { id: true },
    });
    if (!current) return null;
    return this.close(current.id, resolution, byUserId);
  }

  /** Manual resolution from the dashboard. */
  async resolveById(id: string, userId: string, userName: string) {
    const alert = await this.findRaw(id);
    if (alert.status === 'resolved') throw new ConflictException('La alerta ya estaba resuelta');
    return this.toView((await this.close(id, `Cerrada manualmente por ${userName}`, userId))!);
  }

  /** "Lo atiendo": stops reminders and escalation, and records who took it. */
  async acknowledge(id: string, userId: string) {
    const { count } = await this.prisma.alert.updateMany({
      where: { id, status: 'open' },
      data: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedById: userId },
    });
    const alert = await this.findRaw(id);
    if (count === 0 && alert.status === 'resolved') {
      throw new ConflictException('La alerta ya se resolvió');
    }
    if (count > 0) this.publish(alert);
    return this.toView(alert);
  }

  /** Keeps the highest temperature seen while a heat alert is unresolved. */
  async notePeak(deviceId: string, temperature: number) {
    await this.prisma.$executeRaw`
      UPDATE alerts SET peak_temperature = GREATEST(COALESCE(peak_temperature, ${temperature}), ${temperature})
      WHERE device_id = ${deviceId}::uuid
        AND status <> 'resolved'
        AND kind IN ('heat_no_irrigation', 'sustained_heat')`;
  }

  async remind(alertId: string) {
    const alert = await this.prisma.alert.update({
      where: { id: alertId },
      data: { lastNotifiedAt: new Date(), reminderCount: { increment: 1 } },
      include: alertInclude,
    });
    await this.notify(alert, 'alert_reminder');
  }

  async escalate(alertId: string) {
    const alert = await this.prisma.alert.update({
      where: { id: alertId },
      data: { escalatedAt: new Date() },
      include: alertInclude,
    });
    await this.notify(alert, 'alert_escalated');
  }

  async unresolvedKinds(deviceId: string): Promise<AlertKind[]> {
    const alerts = await this.prisma.alert.findMany({
      where: { deviceId, status: { in: UNRESOLVED } },
      select: { kind: true },
    });
    return alerts.map((a) => a.kind);
  }

  /** Unresolved alerts with what the follow-up rules need. */
  findUnresolved(deviceIds?: string[]) {
    return this.prisma.alert.findMany({
      where: {
        status: { in: UNRESOLVED },
        device: { active: true },
        deviceId: deviceIds ? { in: deviceIds } : undefined,
      },
      include: { device: { include: { settings: true } } },
    });
  }

  async list(params: {
    status?: 'active' | 'resolved';
    deviceId?: string;
    before?: Date;
    limit: number;
  }) {
    const alerts = await this.prisma.alert.findMany({
      where: {
        status:
          params.status === 'active'
            ? { in: UNRESOLVED }
            : params.status === 'resolved'
              ? 'resolved'
              : undefined,
        deviceId: params.deviceId,
        openedAt: params.before ? { lt: params.before } : undefined,
      },
      include: alertInclude,
      orderBy: { openedAt: 'desc' },
      take: params.limit,
    });
    return alerts.map((alert) => this.toView(alert));
  }

  async findOne(id: string) {
    return this.toView(await this.findRaw(id));
  }

  private async findRaw(id: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id }, include: alertInclude });
    if (!alert) throw new NotFoundException('Alerta no encontrada');
    return alert;
  }

  private async close(id: string, resolution: string, byUserId?: string) {
    const now = new Date();
    const { count } = await this.prisma.alert.updateMany({
      where: { id, status: { in: UNRESOLVED } },
      data: { status: 'resolved', resolvedAt: now, resolution, resolvedById: byUserId ?? null },
    });
    if (count === 0) return null;
    const alert = await this.findRaw(id);
    this.logger.log(`Alert resolved: ${alert.kind} on ${alert.device.name} (${resolution})`);
    this.publish(alert);
    await this.notify(alert, 'alert_resolved');
    return alert;
  }

  private async notify(alert: AlertWithRelations, phase: Phase) {
    const { thresholds, rules } = deviceConfig(alert.device.settings);
    const message = buildAlertMessage(phase, {
      kind: alert.kind,
      deviceName: alert.device.name,
      openedAt: alert.openedAt,
      resolvedAt: alert.resolvedAt,
      triggerTemperature: alert.triggerTemperature?.toNumber() ?? null,
      peakTemperature: alert.peakTemperature?.toNumber() ?? null,
      resolution: alert.resolution,
      acknowledgedByName: alert.acknowledgedBy?.name ?? null,
      thresholds,
      rules,
    });
    // Escalations go to the people who manage alerts; everything else to everyone who watches the sheds.
    const recipients = await this.notifications.recipientsWith(
      phase === 'alert_escalated' ? 'alerts.manage' : 'telemetry.read',
    );
    await this.notifications.send(recipients, {
      kind: phase,
      severity: phase === 'alert_resolved' ? null : alert.severity,
      alertId: alert.id,
      deviceId: alert.deviceId,
      ...message,
    });
  }

  private publish(alert: Alert) {
    this.stream.publish({
      type: 'alert',
      deviceId: alert.deviceId,
      alert: { id: alert.id, kind: alert.kind, severity: alert.severity, status: alert.status },
    });
  }

  private toView(alert: AlertWithRelations) {
    return {
      id: alert.id,
      kind: alert.kind,
      label: ALERT_LABELS[alert.kind],
      severity: alert.severity,
      status: alert.status,
      device: { id: alert.device.id, name: alert.device.name },
      openedAt: alert.openedAt,
      triggerTemperature: alert.triggerTemperature?.toNumber() ?? null,
      peakTemperature: alert.peakTemperature?.toNumber() ?? null,
      acknowledgedAt: alert.acknowledgedAt,
      acknowledgedBy: alert.acknowledgedBy,
      resolvedAt: alert.resolvedAt,
      resolvedBy: alert.resolvedBy,
      resolution: alert.resolution,
      reminderCount: alert.reminderCount,
      escalatedAt: alert.escalatedAt,
    };
  }
}
