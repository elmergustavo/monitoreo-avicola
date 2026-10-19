import type { EventType } from '../generated/prisma/client.js';

export type ReportFormat = 'pdf' | 'xlsx';

export interface Thresholds {
  tempMin: number;
  tempMax: number;
  tempAlert: number;
}

export interface TemperatureMark {
  temperature: number;
  at: Date;
}

/** Figures for one shed over the whole period, or over one day. */
export interface PeriodStats {
  readings: number;
  average: number | null;
  min: number | null;
  max: number | null;
  /** Share of readings inside [tempMin, tempMax]. Readings arrive at a fixed rate, so this is also a share of time. */
  optimalShare: number | null;
  belowShare: number | null;
  aboveShare: number | null;
  /** Share of readings at or above tempAlert. */
  alertShare: number | null;
  /** Share of 5-minute slots with at least one reading. */
  coverage: number | null;
  irrigationCycles: number;
  irrigationMinutes: number;
  heatAlerts: number;
  prolongedIrrigationAlerts: number;
  sensorErrors: number;
}

export interface DailyStats extends PeriodStats {
  /** YYYY-MM-DD, Guatemala calendar day. */
  date: string;
}

export interface ChartPoint {
  at: Date;
  average: number;
  min: number;
  max: number;
}

export interface ReportEvent {
  at: Date;
  type: EventType;
  temperature: number | null;
  durationMin: number | null;
}

export interface DeviceReport {
  id: string;
  name: string;
  shed: string;
  thresholds: Thresholds;
  totals: PeriodStats;
  coldest: TemperatureMark | null;
  hottest: TemperatureMark | null;
  daily: DailyStats[];
  chart: { bucketSeconds: number; points: ChartPoint[] };
  events: ReportEvent[];
  /** True when events were cut at the export limit. */
  eventsTruncated: boolean;
}

export interface ReportReading {
  at: Date;
  deviceName: string;
  temperature: number;
  min: number;
  max: number;
  irrigation: boolean;
}

export interface ReportData {
  /** Human-friendly identifier printed on the document. */
  code: string;
  generatedAt: Date;
  generatedBy: { name: string; email: string };
  period: {
    from: Date;
    /** Exclusive end. */
    to: Date;
    fromDate: string;
    toDate: string;
    days: number;
  };
  /** Null when the report covers every active shed. */
  scopeDeviceId: string | null;
  devices: DeviceReport[];
}
