import { GT_OFFSET_MS } from '../common/time.util.js';
import type { AlertSeverity, ChannelType, NotificationKind } from '../generated/prisma/client.js';

export interface DeliveryPreferences {
  telegram: boolean;
  whatsapp: boolean;
  includeWarnings: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  dailySummary: boolean;
}

export const DEFAULT_PREFERENCES: DeliveryPreferences = {
  telegram: true,
  whatsapp: true,
  includeWarnings: true,
  quietStart: null,
  quietEnd: null,
  dailySummary: true,
};

export interface OutgoingMessage {
  kind: NotificationKind;
  /** Severity of the alert behind the message (also for "resolved" notices). */
  alertSeverity?: AlertSeverity | null;
}

export const MAX_ATTEMPTS = 5;
/** WhatsApp only allows free-form messages within 24 h of the person's last message. */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60_000;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isValidTime = (value: string) => HHMM.test(value);

function minutesOfDay(value: string): number {
  const match = HHMM.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** True when `now` (Guatemala time) falls in [start, end). Works across midnight (22:00–05:00). */
export function isQuietTime(
  prefs: Pick<DeliveryPreferences, 'quietStart' | 'quietEnd'>,
  now: Date,
) {
  if (!prefs.quietStart || !prefs.quietEnd || prefs.quietStart === prefs.quietEnd) return false;
  const local = new Date(now.getTime() + GT_OFFSET_MS);
  const current = local.getUTCHours() * 60 + local.getUTCMinutes();
  const start = minutesOfDay(prefs.quietStart);
  const end = minutesOfDay(prefs.quietEnd);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/**
 * Whether a message should go to one of the person's channels.
 * Critical alerts always go out, even during quiet hours.
 */
export function shouldDeliver(
  prefs: DeliveryPreferences,
  channel: ChannelType,
  message: OutgoingMessage,
  now: Date,
): boolean {
  // A test goes to every linked channel: it exists to check the link works.
  if (message.kind === 'test') return true;
  if (!prefs[channel]) return false;
  if (message.kind === 'daily_summary') return prefs.dailySummary;

  const critical = message.alertSeverity === 'critical';
  if (!critical && !prefs.includeWarnings) return false;
  if (!critical && isQuietTime(prefs, now)) return false;
  return true;
}

export function whatsappWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  return lastInboundAt !== null && now.getTime() - lastInboundAt.getTime() < WHATSAPP_WINDOW_MS;
}

/** 30 s, 2 min, 10 min, 30 min between attempts. */
export function retryDelayMs(attempts: number): number {
  const delays = [30_000, 120_000, 600_000, 1_800_000];
  return delays[Math.min(attempts, delays.length) - 1] ?? delays[0];
}

/**
 * Normalizes a phone number to E.164. Eight digits are taken as a Guatemalan
 * number (+502). Returns null if it does not look like a phone number.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, '');
  if (/^\d{8}$/.test(cleaned)) return `+502${cleaned}`;
  if (/^00\d{8,15}$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  return null;
}

/** "+502 •••• 1234": enough to recognize it, without showing the full number. */
export function maskPhone(phone: string): string {
  const country = phone.startsWith('+502') ? '+502 ' : '';
  return `${country}•••• ${phone.slice(-4)}`;
}
