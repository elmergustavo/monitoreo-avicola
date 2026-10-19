import type { AlertSeverity, NotificationKind } from '../../generated/prisma/client.js';
import { escapeHtml, type InlineButton } from './telegram.client.js';

export interface ChannelMessage {
  kind: NotificationKind;
  severity: AlertSeverity | null;
  title: string;
  body: string;
  alertId: string | null;
  deviceId: string | null;
}

/** Kinds that ask someone to take the alert ("Lo atiendo" / reply OK). */
const ACTIONABLE = new Set<NotificationKind>(['alert_opened', 'alert_reminder', 'alert_escalated']);

export const ACK_CALLBACK_PREFIX = 'ack:';

function icon(message: ChannelMessage): string {
  switch (message.kind) {
    case 'alert_opened':
      return message.severity === 'critical' ? '🔴' : '🟠';
    case 'alert_reminder':
      return '🔁';
    case 'alert_escalated':
      return '📣';
    case 'alert_resolved':
      return '✅';
    case 'daily_summary':
      return '📋';
    case 'test':
      return '🔔';
  }
}

export const isActionable = (message: ChannelMessage) =>
  ACTIONABLE.has(message.kind) && message.alertId !== null;

/**
 * Telegram rejects buttons that point to localhost or plain http, so links
 * are only added when the dashboard has a public https address.
 */
export function publicDashboardUrl(dashboardUrl: string | undefined): string | null {
  if (!dashboardUrl) return null;
  try {
    const url = new URL(dashboardUrl);
    if (url.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function shedUrl(dashboardUrl: string | null, deviceId: string | null): string | null {
  return dashboardUrl && deviceId ? `${dashboardUrl}/galpones/${deviceId}` : null;
}

export function telegramMessage(
  message: ChannelMessage,
  dashboardUrl: string | null,
): { html: string; buttons?: InlineButton[][] } {
  const html = `${icon(message)} <b>${escapeHtml(message.title)}</b>\n${escapeHtml(message.body)}`;
  const row: InlineButton[] = [];
  if (isActionable(message)) {
    row.push({ text: '✋ Lo atiendo', callback_data: `${ACK_CALLBACK_PREFIX}${message.alertId}` });
  }
  const link = shedUrl(dashboardUrl, message.deviceId);
  if (link) row.push({ text: '📊 Ver galpón', url: link });
  return { html, buttons: row.length > 0 ? [row] : undefined };
}

export function whatsappMessage(message: ChannelMessage, dashboardUrl: string | null): string {
  const lines = [`${icon(message)} *${message.title}*`, message.body];
  if (isActionable(message)) lines.push('', 'Responde *OK* si tú la atiendes.');
  const link = shedUrl(dashboardUrl, message.deviceId);
  if (link) lines.push('', link);
  return lines.join('\n');
}
