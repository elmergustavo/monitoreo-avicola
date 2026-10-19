import type { DeviceEvent, Reading, Shed, ShedTelemetry, TelemetrySnapshot } from './types';

/**
 * Demo data source. It simulates what the ESP32 sends: a reading every
 * 30 seconds and irrigation on/off events, following a daily heat cycle.
 * It will be replaced by the API + server-sent events.
 */

const READING_INTERVAL_MS = 30_000;
const HISTORY_DAYS = 7;
const LIVE_TICK_MS = 3_000;
const DEFAULT_SETTINGS = { tempMin: 27, tempMax: 30, tempAlert: 32 };

const SHEDS: Array<Shed & { heatOffset: number; seed: number }> = [
  { id: 'galpon-1', name: 'Galpón 1', settings: DEFAULT_SETTINGS, heatOffset: 0, seed: 7 },
  { id: 'galpon-2', name: 'Galpón 2', settings: DEFAULT_SETTINGS, heatOffset: 0.9, seed: 21 },
];

/** Small deterministic PRNG so the demo looks the same on every load. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimulatorState {
  random: () => number;
  noise: number;
  cooling: number;
  irrigationOnAt: number | null;
  irrigationTargetMin: number;
  lastIrrigationOffAt: number;
  lastHeatAlertAt: number;
  eventSeq: number;
}

class ShedSimulator {
  readonly readings: Reading[] = [];
  readonly events: DeviceEvent[] = [];
  private readonly state: SimulatorState;
  private readonly shed: (typeof SHEDS)[number];

  constructor(shed: (typeof SHEDS)[number]) {
    this.shed = shed;
    this.state = {
      random: createRandom(shed.seed),
      noise: 0,
      cooling: 0,
      irrigationOnAt: null,
      irrigationTargetMin: 8,
      lastIrrigationOffAt: 0,
      lastHeatAlertAt: 0,
      eventSeq: 0,
    };
  }

  step(at: number): void {
    const s = this.state;
    const { tempMax, tempAlert } = this.shed.settings;

    // Daily cycle peaking around 14:00 Guatemala time (UTC-6).
    const hourGt = (((at / 3_600_000 - 6) % 24) + 24) % 24;
    const dayIndex = Math.floor(at / 86_400_000);
    const dayOffset = Math.sin(dayIndex * 1.7) * 0.8;
    const base = 26.4 + 5 * Math.sin(((hourGt - 8) / 24) * 2 * Math.PI) + dayOffset + this.shed.heatOffset;

    s.noise = Math.max(-0.5, Math.min(0.5, s.noise * 0.98 + (s.random() - 0.5) * 0.06));
    const irrigating = s.irrigationOnAt !== null;
    s.cooling = irrigating ? Math.min(2.4, s.cooling + 0.07) : Math.max(0, s.cooling - 0.025);

    const temperature = Math.round((base + s.noise - s.cooling) * 100) / 100;

    if (!irrigating && temperature > tempMax + 0.5 && at - s.lastIrrigationOffAt > 18 * 60_000) {
      s.irrigationOnAt = at;
      s.irrigationTargetMin = 6 + s.random() * 6;
      this.addEvent(at, 'irrigation_on', temperature, null);
    } else if (irrigating && s.irrigationOnAt !== null) {
      const minutesOn = (at - s.irrigationOnAt) / 60_000;
      if (minutesOn >= s.irrigationTargetMin) {
        this.addEvent(at, 'irrigation_off', temperature, Math.round(minutesOn * 10) / 10);
        s.irrigationOnAt = null;
        s.lastIrrigationOffAt = at;
      }
    }

    if (temperature >= tempAlert && s.irrigationOnAt === null && at - s.lastHeatAlertAt > 60 * 60_000) {
      s.lastHeatAlertAt = at;
      this.addEvent(at, 'heat_alert_no_irrigation', temperature, null);
    }

    this.readings.push({ at, temperature, irrigation: s.irrigationOnAt !== null });
  }

  addEvent(at: number, type: DeviceEvent['type'], temperature: number | null, durationMin: number | null): void {
    this.state.eventSeq += 1;
    this.events.push({ id: `${this.shed.id}-${this.state.eventSeq}`, at, type, temperature, durationMin });
  }

  snapshot(): ShedTelemetry {
    const { heatOffset: _h, seed: _s, ...shed } = this.shed;
    return { shed, readings: [...this.readings], events: [...this.events] };
  }
}

type Listener = () => void;

class MockTelemetryStore {
  private readonly simulators: ShedSimulator[];
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private current: TelemetrySnapshot;

  constructor() {
    const now = Date.now();
    const start = now - HISTORY_DAYS * 86_400_000;
    this.simulators = SHEDS.map((shed) => {
      const sim = new ShedSimulator(shed);
      for (let at = start; at <= now; at += READING_INTERVAL_MS) sim.step(at);
      return sim;
    });
    // One sensor glitch in the history, to show how it looks.
    this.simulators[1]?.addEvent(now - 26 * 3_600_000, 'sensor_error', null, null);
    this.current = this.buildSnapshot();
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    if (!this.timer) this.timer = setInterval(this.tick, LIVE_TICK_MS);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  getSnapshot = (): TelemetrySnapshot => this.current;

  private tick = (): void => {
    const now = Date.now();
    this.simulators.forEach((sim) => sim.step(now));
    this.current = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  };

  private buildSnapshot(): TelemetrySnapshot {
    const sheds = this.simulators.map((sim) => sim.snapshot());
    const lastUpdate = Math.max(...sheds.map((s) => s.readings.at(-1)?.at ?? 0)) || null;
    return { sheds, lastUpdate };
  }
}

export const mockTelemetryStore = new MockTelemetryStore();
