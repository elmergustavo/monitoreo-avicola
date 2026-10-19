/** API response shapes (dates arrive as ISO strings). */

export type Permission =
  | 'telemetry.read'
  | 'reports.export'
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

export interface Device {
  id: string;
  name: string;
  shed: string;
  active: boolean;
  online: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  settings: Settings;
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
