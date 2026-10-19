import type { AlertKind, AlertSeverity } from '@/lib/types';

export interface Thresholds {
  tempMin: number;
  tempMax: number;
  tempAlert: number;
}

export interface KpiSet {
  readings: number;
  average: number | null;
  min: number | null;
  max: number | null;
  optimalShare: number | null;
  alertShare: number | null;
  coverage: number | null;
  irrigationCycles: number;
  irrigationMinutesPerDay: number | null;
  alerts: number;
}

export interface AnalyticsSummary {
  period: { from: string; to: string; days: number };
  /** First day with data when the shed started after the period began. */
  dataSince: string | null;
  previousPeriod: { from: string; to: string } | null;
  thresholds: Thresholds;
  current: KpiSet;
  previous: KpiSet | null;
  hottest: { temperature: number; at: string } | null;
  coldest: { temperature: number; at: string } | null;
}

export interface SeriesPoint {
  at: string;
  average: number;
  min: number;
  max: number;
  irrigation: boolean;
}

export interface AnalyticsSeries {
  bucketSeconds: number;
  thresholds: Thresholds;
  points: SeriesPoint[];
  irrigation: { from: string; to: string }[];
  alerts: {
    id: string;
    kind: AlertKind;
    label: string;
    severity: AlertSeverity;
    openedAt: string;
    resolvedAt: string | null;
    temperature: number | null;
  }[];
}

export interface AnalyticsHeatmap {
  days: string[];
  thresholds: Thresholds;
  cells: { date: string; hour: number; average: number; max: number; count: number }[];
}

export interface AnalyticsRanges {
  thresholds: Thresholds;
  days: {
    date: string;
    readings: number;
    cold: number | null;
    optimal: number | null;
    warm: number | null;
    alert: number | null;
  }[];
}

export interface IrrigationCycle {
  at: string;
  durationMin: number | null;
  startTemperature: number | null;
  after15Temperature: number | null;
  drop: number | null;
  recoveryMin: number | null;
  startedHot: boolean;
}

export interface AnalyticsIrrigation {
  thresholds: Thresholds;
  summary: {
    cycles: number;
    measured: number;
    averageDrop: number | null;
    effectiveShare: number | null;
    startedHot: number;
    averageRecoveryMin: number | null;
    recoveredShare: number | null;
    averageDurationMin: number | null;
  };
  curve: { minute: number; delta: number; cycles: number }[];
  cycles: IrrigationCycle[];
}

export interface AnalyticsCompare {
  slotMinutes: number;
  thresholds: Thresholds;
  day: string;
  previousDay: string;
  curves: { day: (number | null)[]; previousDay: (number | null)[]; weekAverage: (number | null)[] };
  devices: { id: string; name: string; current: boolean; points: (number | null)[] }[];
}
