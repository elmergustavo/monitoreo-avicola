import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service.js';
import { AuditService } from '../audit/audit.service.js';
import { formatTime } from '../common/time.util.js';
import { DevicesService } from '../devices/devices.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ChatFormat = 'telegram' | 'whatsapp';

type AlertView = Awaited<ReturnType<AlertsService['findOne']>>;

export type AckOutcome =
  | { result: 'acknowledged'; alert: AlertView }
  | { result: 'already'; alert: AlertView; by: string }
  | { result: 'resolved' | 'not_found' | 'forbidden' };

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bold in the chat's own syntax; Telegram text is HTML, so it is escaped too. */
export const bold = (text: string, format: ChatFormat) =>
  format === 'telegram' ? `<b>${escape(text)}</b>` : `*${text}*`;
export const plain = (text: string, format: ChatFormat) =>
  format === 'telegram' ? escape(text) : text;

function ago(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} días`;
}

/** What the bots answer to /estado, /alertas and "Lo atiendo", shared by Telegram and WhatsApp. */
@Injectable()
export class FarmCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DevicesService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
  ) {}

  /** Only active users who can see the sheds may use the bots. */
  async canWatch(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { active: true, role: { select: { permissions: true } } },
    });
    return Boolean(user?.active && user.role.permissions.includes('telemetry.read'));
  }

  async statusText(format: ChatFormat, now = new Date()): Promise<string> {
    const [devices, open] = await Promise.all([
      this.devices.list(false),
      this.alerts.list({ status: 'active', limit: 100 }),
    ]);
    if (devices.length === 0) return 'No hay galpones registrados.';

    const blocks = devices.map((device) => {
      const reading = device.lastReading;
      const lines = [bold(device.name, format)];
      if (!reading) {
        lines.push('Sin datos todavía.');
      } else {
        const temperature = reading.temperature;
        const state =
          temperature >= device.settings.tempAlert
            ? '🔴 alerta'
            : temperature > device.settings.tempMax
              ? '🟠 calor'
              : temperature < device.settings.tempMin
                ? '🔵 frío'
                : '🟢 óptima';
        lines.push(
          `🌡 ${temperature.toFixed(1)} °C (${state}) · 💧 riego ${reading.irrigation ? 'encendido' : 'apagado'}`,
        );
        lines.push(
          device.online
            ? `En línea · última lectura ${formatTime(new Date(reading.createdAt))}`
            : `⚠️ Sin conexión · último dato ${ago(new Date(reading.createdAt), now)}`,
        );
      }
      const alerts = open.filter((alert) => alert.device.id === device.id);
      if (alerts.length > 0) {
        lines.push(`🚨 ${alerts.map((alert) => plain(alert.label, format)).join(', ')}`);
      }
      return lines.join('\n');
    });
    return blocks.join('\n\n');
  }

  openAlerts() {
    return this.alerts.list({ status: 'active', limit: 20 });
  }

  /** Describes one open alert in a line, for /alertas. */
  alertLine(alert: AlertView, format: ChatFormat, now = new Date()): string {
    const who = alert.acknowledgedBy
      ? ` · la atiende ${plain(alert.acknowledgedBy.name, format)}`
      : '';
    return `${alert.severity === 'critical' ? '🔴' : '🟠'} ${bold(`${alert.label} · ${alert.device.name}`, format)}\nDesde las ${formatTime(alert.openedAt)} (${ago(alert.openedAt, now)})${who}`;
  }

  /** "Lo atiendo" from a chat. */
  async acknowledge(userId: string, alertId: string, via: ChatFormat): Promise<AckOutcome> {
    if (!(await this.canWatch(userId))) return { result: 'forbidden' };
    let alert: AlertView;
    try {
      alert = await this.alerts.acknowledge(alertId, userId);
    } catch (error) {
      if (error instanceof ConflictException) return { result: 'resolved' };
      if (error instanceof NotFoundException) return { result: 'not_found' };
      throw error;
    }
    if (alert.acknowledgedBy && alert.acknowledgedBy.id !== userId) {
      return { result: 'already', alert, by: alert.acknowledgedBy.name };
    }
    await this.audit.record({
      userId,
      action: 'alert.acknowledged',
      entityType: 'alert',
      entityId: alert.id,
      metadata: { kind: alert.kind, device: alert.device.name, via },
    });
    return { result: 'acknowledged', alert };
  }

  async userName(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? 'Alguien';
  }
}
