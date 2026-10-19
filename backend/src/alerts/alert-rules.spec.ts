import {
  DEFAULT_ALERT_RULES,
  dueFollowUps,
  evaluateDevice,
  type DeviceSnapshot,
  type FollowUpInput,
  type WindowStats,
} from './alert-rules.js';

const NOW = new Date('2026-10-19T20:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const thresholds = { tempMin: 27, tempMax: 30, tempAlert: 32 };
const empty: WindowStats = { count: 0, min: null, max: null, firstAt: null };
const window = (min: number, max: number, startedMinutesAgo: number, count = 20): WindowStats => ({
  count,
  min,
  max,
  firstAt: minutesAgo(startedMinutesAgo),
});

function snapshot(overrides: Partial<DeviceSnapshot> = {}): DeviceSnapshot {
  return {
    lastSeenAt: minutesAgo(0.5),
    thresholds,
    rules: DEFAULT_ALERT_RULES,
    heatWindow: window(28, 29, 10),
    coldWindow: window(28, 29, 30),
    recoveryWindow: window(28, 29, 5),
    unresolved: [],
    ...overrides,
  };
}

describe('evaluateDevice', () => {
  it('does nothing while everything is in range', () => {
    expect(evaluateDevice(snapshot(), NOW)).toEqual({ open: [], resolve: [] });
  });

  describe('offline', () => {
    it('opens after offlineAfterMin minutes without data', () => {
      const decisions = evaluateDevice(snapshot({ lastSeenAt: minutesAgo(5) }), NOW);
      expect(decisions.open).toEqual([
        { kind: 'device_offline', metadata: { lastSeenAt: minutesAgo(5).toISOString() } },
      ]);
    });

    it('waits until the limit is reached', () => {
      expect(evaluateDevice(snapshot({ lastSeenAt: minutesAgo(4.9) }), NOW).open).toEqual([]);
    });

    it('ignores sheds that never reported', () => {
      expect(evaluateDevice(snapshot({ lastSeenAt: null }), NOW).open).toEqual([]);
    });

    it('does not reopen an unresolved alert', () => {
      const decisions = evaluateDevice(
        snapshot({ lastSeenAt: minutesAgo(60), unresolved: ['device_offline'] }),
        NOW,
      );
      expect(decisions.open).toEqual([]);
    });
  });

  describe('sustained heat', () => {
    it('opens when every reading of the window is at or above the alert temperature', () => {
      const decisions = evaluateDevice(
        snapshot({ heatWindow: window(32, 33.4, 10), recoveryWindow: window(32.5, 33.4, 5) }),
        NOW,
      );
      expect(decisions.open).toEqual([{ kind: 'sustained_heat', temperature: 33.4 }]);
    });

    it('needs the whole window: a heat spike of a few minutes is not sustained', () => {
      const decisions = evaluateDevice(snapshot({ heatWindow: window(32, 33, 4) }), NOW);
      expect(decisions.open).toEqual([]);
    });

    it('needs more than one reading', () => {
      const decisions = evaluateDevice(snapshot({ heatWindow: window(33, 33, 10, 1) }), NOW);
      expect(decisions.open).toEqual([]);
    });

    it('does not open if one reading in the window dipped below the alert', () => {
      const decisions = evaluateDevice(snapshot({ heatWindow: window(31.9, 33, 10) }), NOW);
      expect(decisions.open).toEqual([]);
    });
  });

  describe('heat recovery (hysteresis)', () => {
    const open = ['sustained_heat', 'heat_no_irrigation'] as const;

    it('resolves heat alerts once the last 5 minutes stay below alert - 0.5 °C', () => {
      const decisions = evaluateDevice(
        snapshot({ recoveryWindow: window(30, 31.4, 5), unresolved: [...open] }),
        NOW,
      );
      expect(decisions.resolve.map((r) => r.kind)).toEqual([...open]);
    });

    it('keeps them open while the temperature hovers around the threshold', () => {
      const decisions = evaluateDevice(
        snapshot({ recoveryWindow: window(31.2, 31.6, 5), unresolved: [...open] }),
        NOW,
      );
      expect(decisions.resolve).toEqual([]);
    });

    it('keeps them open when there is no recent data', () => {
      const decisions = evaluateDevice(
        snapshot({ recoveryWindow: empty, unresolved: [...open] }),
        NOW,
      );
      expect(decisions.resolve).toEqual([]);
    });
  });

  describe('sustained cold', () => {
    it('opens after 30 minutes below the minimum', () => {
      const decisions = evaluateDevice(snapshot({ coldWindow: window(24.5, 26.9, 30) }), NOW);
      expect(decisions.open).toEqual([{ kind: 'sustained_cold', temperature: 24.5 }]);
    });

    it('resolves once the temperature stays above minimum + 0.5 °C', () => {
      const decisions = evaluateDevice(
        snapshot({ recoveryWindow: window(27.6, 28, 5), unresolved: ['sustained_cold'] }),
        NOW,
      );
      expect(decisions.resolve).toEqual([
        { kind: 'sustained_cold', resolution: 'La temperatura volvió sobre el mínimo' },
      ]);
    });
  });
});

describe('dueFollowUps', () => {
  const base: FollowUpInput = {
    severity: 'critical',
    status: 'open',
    openedAt: minutesAgo(10),
    lastNotifiedAt: minutesAgo(10),
    reminderCount: 0,
    escalatedAt: null,
  };

  it('does nothing early on', () => {
    expect(dueFollowUps(base, DEFAULT_ALERT_RULES, NOW)).toEqual({
      remind: false,
      escalate: false,
    });
  });

  it('escalates an unattended critical alert after escalateAfterMin', () => {
    const due = dueFollowUps({ ...base, openedAt: minutesAgo(15) }, DEFAULT_ALERT_RULES, NOW);
    expect(due.escalate).toBe(true);
  });

  it('never escalates twice or escalates warnings', () => {
    const rules = DEFAULT_ALERT_RULES;
    const old = minutesAgo(60);
    expect(dueFollowUps({ ...base, openedAt: old, escalatedAt: old }, rules, NOW).escalate).toBe(
      false,
    );
    expect(dueFollowUps({ ...base, openedAt: old, severity: 'warning' }, rules, NOW).escalate).toBe(
      false,
    );
  });

  it('reminds every reminderEveryMin, up to 4 times', () => {
    const rules = DEFAULT_ALERT_RULES;
    expect(dueFollowUps({ ...base, lastNotifiedAt: minutesAgo(30) }, rules, NOW).remind).toBe(true);
    expect(dueFollowUps({ ...base, lastNotifiedAt: minutesAgo(29) }, rules, NOW).remind).toBe(
      false,
    );
    expect(
      dueFollowUps({ ...base, lastNotifiedAt: minutesAgo(30), reminderCount: 4 }, rules, NOW)
        .remind,
    ).toBe(false);
  });

  it('stops once someone attends the alert', () => {
    const due = dueFollowUps(
      { ...base, status: 'acknowledged', openedAt: minutesAgo(90), lastNotifiedAt: minutesAgo(90) },
      DEFAULT_ALERT_RULES,
      NOW,
    );
    expect(due).toEqual({ remind: false, escalate: false });
  });
});
