import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ALERT_LABELS } from '../alerts/alert-messages.js';
import { dateKeyGt, startOfDayGt } from '../common/time.util.js';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportDataService } from '../reports/report-data.service.js';

const pct = (share: number | null) => (share === null ? null : `${Math.round(share * 100)} %`);
const temp = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)} °C`);

function duration(minutes: number): string {
  const total = Math.round(minutes);
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h ${total % 60} min`;
}

/**
 * At 18:00 (Guatemala) everyone who watches the sheds gets the day in a few
 * lines; in Telegram it comes with the day's PDF report attached.
 */
@Injectable()
export class DailySummaryService {
  private readonly logger = new Logger(DailySummaryService.name);
  private readonly automatic: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportDataService,
    private readonly notifications: NotificationsService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.automatic = config.get('NODE_ENV', { infer: true }) !== NodeEnv.Test;
  }

  @Cron('0 18 * * *', { name: 'daily-summary', timeZone: 'America/Guatemala' })
  protected async scheduledRun() {
    if (!this.automatic) return;
    try {
      const result = await this.send();
      this.logger.log(`Daily summary sent (${result.inbox} inboxes, ${result.deliveries} chats)`);
    } catch (error) {
      this.logger.error('Daily summary failed', error as Error);
    }
  }

  /** Builds the summary of the Guatemala day that contains `now`. */
  async build(now = new Date()) {
    const date = dateKeyGt(now);
    const report = await this.reports.build({
      fromDate: date,
      toDate: date,
      requester: { name: 'Resumen automático', email: '' },
    });
    const dayStart = startOfDayGt(now);
    const [todays, open] = await Promise.all([
      this.prisma.alert.findMany({
        where: { openedAt: { gte: dayStart } },
        select: { deviceId: true, kind: true },
      }),
      this.prisma.alert.findMany({
        where: { status: { not: 'resolved' } },
        select: { kind: true, device: { select: { name: true } } },
      }),
    ]);

    const lines = report.devices.map((device) => {
      const t = device.totals;
      if (t.readings === 0) return `${device.name}: sin lecturas hoy.`;
      const alerts = todays.filter((a) => a.deviceId === device.id).length;
      const parts = [
        `${temp(t.min)} a ${temp(t.max)} (promedio ${temp(t.average)})`,
        pct(t.optimalShare) ? `${pct(t.optimalShare)} del día en rango óptimo` : null,
        t.irrigationCycles > 0
          ? `${t.irrigationCycles} ${t.irrigationCycles === 1 ? 'riego' : 'riegos'} (${duration(t.irrigationMinutes)})`
          : 'sin riegos',
        alerts > 0 ? `${alerts} ${alerts === 1 ? 'alerta' : 'alertas'}` : 'sin alertas',
      ].filter(Boolean);
      return `${device.name}: ${parts.join(' · ')}.`;
    });

    if (open.length > 0) {
      const list = open.map((a) => `${ALERT_LABELS[a.kind]} (${a.device.name})`).join(', ');
      lines.push(`Siguen abiertas: ${list}.`);
    }

    const [, month, day] = date.split('-');
    let body = lines.join('\n');
    if (body.length > 1000) body = `${body.slice(0, 997)}…`;
    return { date, title: `Resumen del día ${day}/${month}`, body };
  }

  /** `onlyUserIds` narrows the recipients (tests). */
  async send(now = new Date(), onlyUserIds?: string[]) {
    const summary = await this.build(now);
    const recipients = await this.prisma.user.findMany({
      where: {
        id: onlyUserIds ? { in: onlyUserIds } : undefined,
        active: true,
        role: { permissions: { has: 'telemetry.read' } },
        OR: [{ notificationPrefs: null }, { notificationPrefs: { dailySummary: true } }],
      },
      select: { id: true },
    });
    return this.notifications.send(
      recipients.map((u) => u.id),
      {
        kind: 'daily_summary',
        title: summary.title,
        body: summary.body,
        attachment: { type: 'daily_report', date: summary.date },
        toGroups: true,
      },
    );
  }
}
