/** API response shapes (dates arrive as ISO strings). */

export type Permission =
  | 'telemetry.read'
  | 'reports.export'
  | 'alerts.manage'
  | 'settings.manage'
  | 'devices.manage'
  | 'users.read'
  | 'users.manage'
  | 'roles.manage'
  | 'audit.read';

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  role: RoleSummary;
  permissions: Permission[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: RoleSummary;
}

export interface Role extends RoleSummary {
  description: string | null;
  permissions: Permission[];
  isSystem: boolean;
  userCount: number;
}

export interface Settings {
  tempMin: number;
  tempMax: number;
  tempAlert: number;
}

/** Alert timings of a shed, in minutes. */
export interface AlertRules {
  offlineAfterMin: number;
  sustainedHeatMin: number;
  sustainedColdMin: number;
  reminderEveryMin: number;
  escalateAfterMin: number;
}

export interface Device {
  id: string;
  name: string;
  shed: string;
  active: boolean;
  online: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  settings: Settings;
  alertRules: AlertRules;
  lastReading: { temperature: number; humidity: number | null; irrigation: boolean; createdAt: string } | null;
}

export interface ReadingPointDto {
  at: string;
  temperature: number;
  min: number;
  max: number;
  irrigation: boolean;
}

export interface ReadingsResponse {
  from: string;
  to: string;
  bucketSeconds: number;
  points: ReadingPointDto[];
}

export type EventType =
  | 'irrigation_on'
  | 'irrigation_off'
  | 'heat_alert_no_irrigation'
  | 'prolonged_irrigation_alert'
  | 'sensor_error';

export interface DeviceEventDto {
  id: string;
  type: EventType;
  temperature: number | null;
  durationMin: number | null;
  createdAt: string;
}

export interface DaySummaryDto {
  date: string;
  readingsCount: number;
  average: number | null;
  optimalShare: number | null;
  min: { temperature: number; at: string } | null;
  max: { temperature: number; at: string } | null;
  irrigationCycles: number;
  irrigationMinutes: number;
  lastIrrigationOnAt: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

export type ReportFormat = 'pdf' | 'xlsx';

export interface RecentReport {
  id: string;
  createdAt: string;
  code: string | null;
  format: ReportFormat | null;
  /** YYYY-MM-DD, inclusive */
  from: string | null;
  to: string | null;
  deviceId: string | null;
  deviceName: string | null;
}

export type AlertKind =
  | 'heat_no_irrigation'
  | 'prolonged_irrigation'
  | 'sensor_error'
  | 'device_offline'
  | 'sustained_heat'
  | 'sustained_cold';

export type AlertSeverity = 'critical' | 'warning';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface AlertView {
  id: string;
  kind: AlertKind;
  label: string;
  severity: AlertSeverity;
  status: AlertStatus;
  device: { id: string; name: string };
  openedAt: string;
  triggerTemperature: number | null;
  peakTemperature: number | null;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  resolution: string | null;
  reminderCount: number;
  escalatedAt: string | null;
}

export interface AlertStats {
  days: number;
  since: string;
  total: number;
  critical: number;
  unresolved: number;
  escalated: number;
  acknowledged: number;
  avgResponseMin: number | null;
  avgDurationMin: number | null;
  byKind: { kind: AlertKind; label: string; count: number }[];
}

export type NotificationKind =
  | 'alert_opened'
  | 'alert_reminder'
  | 'alert_escalated'
  | 'alert_resolved'
  | 'daily_summary'
  | 'test';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  severity: AlertSeverity | null;
  title: string;
  body: string;
  alertId: string | null;
  alertStatus: AlertStatus | null;
  deviceId: string | null;
  readAt: string | null;
  createdAt: string;
}

export type ChannelType = 'telegram' | 'whatsapp';

export interface NotificationChannelView {
  id: string;
  type: ChannelType;
  label: string | null;
  isGroup: boolean;
  active: boolean;
  createdAt: string;
  lastInboundAt: string | null;
  /** WhatsApp: whether messages can reach the number right now (24 h window). */
  windowOpen: boolean | null;
}

export interface NotificationGroup extends NotificationChannelView {
  linkedBy: { id: string; name: string } | null;
}

export interface NotificationPreferences {
  telegram: boolean;
  whatsapp: boolean;
  includeWarnings: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  dailySummary: boolean;
}

export interface NotificationProviders {
  telegram: { configured: boolean; botUsername: string | null };
  whatsapp: { configured: boolean; number: string | null; sandboxJoinCode: string | null };
}

export interface NotificationSettings {
  providers: NotificationProviders;
  preferences: NotificationPreferences;
  channels: NotificationChannelView[];
}

export interface TelegramLink {
  code: string;
  expiresAt: string;
  url: string;
  botUsername: string;
}

export interface WhatsAppLink {
  code: string;
  expiresAt: string;
  phone: string;
  number: string;
  message: string;
  sandboxJoinCode: string | null;
  url: string;
}

export interface GroupLink {
  code: string;
  expiresAt: string;
  botUsername: string;
  command: string;
  addToGroupUrl: string;
}

export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface DeliveryItem {
  id: string;
  kind: NotificationKind;
  severity: AlertSeverity | null;
  title: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  channel: { type: ChannelType; label: string | null; isGroup: boolean; user: { id: string; name: string } | null };
}
