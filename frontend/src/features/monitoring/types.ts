export type EventType =
  | 'irrigation_on'
  | 'irrigation_off'
  | 'heat_alert_no_irrigation'
  | 'prolonged_irrigation_alert'
  | 'sensor_error';

export interface Reading {
  /** Epoch milliseconds (UTC). */
  at: number;
  temperature: number;
  irrigation: boolean;
}

export interface DeviceEvent {
  id: string;
  at: number;
  type: EventType;
  temperature: number | null;
  durationMin: number | null;
}

export interface ShedSettings {
  tempMin: number;
  tempMax: number;
  tempAlert: number;
}

export interface Shed {
  id: string;
  name: string;
  settings: ShedSettings;
}

export interface ShedTelemetry {
  shed: Shed;
  readings: Reading[];
  events: DeviceEvent[];
}

export interface TelemetrySnapshot {
  sheds: ShedTelemetry[];
  /** Time of the most recent reading across all sheds. */
  lastUpdate: number | null;
}
