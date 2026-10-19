import type { AlertKind, AlertSeverity, AlertStatus } from '../generated/prisma/client.js';

/**
 * Pure alert rules: given a snapshot of a shed and the current time, decide
 * which alerts to open, resolve, remind or escalate. No database access here,
 * so every rule can be tested with a fixed clock.
 */

export const SEVERITY: Record<AlertKind, AlertSeverity> = {
  heat_no_irrigation: 'critical',
  sensor_error: 'critical',
  device_offline: 'critical',
  sustained_heat: 'critical',
  prolonged_irrigation: 'warning',
  sustained_cold: 'warning',
};

/** A temperature must go this far back past the threshold to close an alert. */
export const HYSTERESIS_C = 0.5;
/** Minutes the temperature must stay back in range before a heat/cold alert closes. */
export const RECOVERY_MIN = 5;
export const MAX_REMINDERS = 4;
/** Readings must start this close to the beginning of a window for it to count as "sustained". */
const WINDOW_START_TOLERANCE_MS = 2 * 60_000;

const MINUTE = 60_000;

export interface AlertRules {
  offlineAfterMin: number;
  sustainedHeatMin: number;
  sustainedColdMin: number;
  reminderEveryMin: number;
  escalateAfterMin: number;
}

export const DEFAULT_ALERT_RULES: AlertRules = {
  offlineAfterMin: 5,
  sustainedHeatMin: 10,
  sustainedColdMin: 30,
  reminderEveryMin: 30,
  escalateAfterMin: 15,
};

export interface Thresholds {
  tempMin: number;
  tempMax: number;
  tempAlert: number;
}

/** Aggregates over readings that started at or after a given moment. */
export interface WindowStats {
  count: number;
  min: number | null;
  max: number | null;
  firstAt: Date | null;
}

export interface DeviceSnapshot {
  lastSeenAt: Date | null;
  thresholds: Thresholds;
  rules: AlertRules;
  /** Readings in the last `sustainedHeatMin` minutes. */
  heatWindow: WindowStats;
  /** Readings in the last `sustainedColdMin` minutes. */
  coldWindow: WindowStats;
  /** Readings in the last RECOVERY_MIN minutes. */
  recoveryWindow: WindowStats;
  /** Kinds that currently have an unresolved alert. */
  unresolved: AlertKind[];
}

export interface OpenDecision {
  kind: AlertKind;
  temperature?: number;
  metadata?: Record<string, string | number>;
}

export interface ResolveDecision {
  kind: AlertKind;
  resolution: string;
}

export interface Decisions {
  open: OpenDecision[];
  resolve: ResolveDecision[];
}

/** Window covers (almost) its whole duration with data: avoids alerting on a single reading. */
function coversWindow(stats: WindowStats, now: Date, minutes: number): boolean {
  if (stats.count < 2 || !stats.firstAt) return false;
  const windowStart = now.getTime() - minutes * MINUTE;
  return stats.firstAt.getTime() <= windowStart + WINDOW_START_TOLERANCE_MS;
}

/** Time-based conditions, evaluated once a minute for each active shed. */
export function evaluateDevice(snapshot: DeviceSnapshot, now: Date): Decisions {
  const { thresholds, rules, unresolved } = snapshot;
  const isOpen = (kind: AlertKind) => unresolved.includes(kind);
  const decisions: Decisions = { open: [], resolve: [] };

  // Offline: a shed that never reported is not "offline", it is not installed yet.
  if (snapshot.lastSeenAt) {
    const silentMs = now.getTime() - snapshot.lastSeenAt.getTime();
    if (silentMs >= rules.offlineAfterMin * MINUTE && !isOpen('device_offline')) {
      decisions.open.push({
        kind: 'device_offline',
        metadata: { lastSeenAt: snapshot.lastSeenAt.toISOString() },
      });
    }
  }

  // Sustained heat: every reading of the window at or above the alert temperature.
  const heat = snapshot.heatWindow;
  if (
    !isOpen('sustained_heat') &&
    heat.min !== null &&
    heat.min >= thresholds.tempAlert &&
    coversWindow(heat, now, rules.sustainedHeatMin)
  ) {
    decisions.open.push({ kind: 'sustained_heat', temperature: heat.max ?? heat.min });
  }

  // Sustained cold: every reading of the window below the minimum.
  const cold = snapshot.coldWindow;
  if (
    !isOpen('sustained_cold') &&
    cold.max !== null &&
    cold.max < thresholds.tempMin &&
    coversWindow(cold, now, rules.sustainedColdMin)
  ) {
    decisions.open.push({ kind: 'sustained_cold', temperature: cold.min ?? cold.max });
  }

  // Recovery, with hysteresis, over the last few minutes of data.
  const recent = snapshot.recoveryWindow;
  const recovered = recent.count > 0 && coversWindow(recent, now, RECOVERY_MIN);
  if (recovered && recent.max !== null && recent.max < thresholds.tempAlert - HYSTERESIS_C) {
    for (const kind of ['sustained_heat', 'heat_no_irrigation'] as const) {
      if (isOpen(kind)) {
        decisions.resolve.push({ kind, resolution: 'La temperatura bajó del nivel de alerta' });
      }
    }
  }
  if (
    recovered &&
    recent.min !== null &&
    recent.min > thresholds.tempMin + HYSTERESIS_C &&
    isOpen('sustained_cold')
  ) {
    decisions.resolve.push({
      kind: 'sustained_cold',
      resolution: 'La temperatura volvió sobre el mínimo',
    });
  }

  return decisions;
}

export interface FollowUpInput {
  severity: AlertSeverity;
  status: AlertStatus;
  openedAt: Date;
  lastNotifiedAt: Date;
  reminderCount: number;
  escalatedAt: Date | null;
}

export interface FollowUps {
  remind: boolean;
  escalate: boolean;
}

/** Reminders while nobody attends an alert; escalation for unattended critical ones. */
export function dueFollowUps(alert: FollowUpInput, rules: AlertRules, now: Date): FollowUps {
  if (alert.status !== 'open') return { remind: false, escalate: false };
  const remind =
    alert.reminderCount < MAX_REMINDERS &&
    now.getTime() - alert.lastNotifiedAt.getTime() >= rules.reminderEveryMin * MINUTE;
  const escalate =
    alert.severity === 'critical' &&
    alert.escalatedAt === null &&
    now.getTime() - alert.openedAt.getTime() >= rules.escalateAfterMin * MINUTE;
  return { remind, escalate };
}
