import { useSyncExternalStore } from 'react';
import { mockTelemetryStore } from './mock-telemetry';
import type { TelemetrySnapshot } from './types';

/** Live telemetry for every shed. Currently backed by the demo simulator. */
export function useTelemetry(): TelemetrySnapshot {
  return useSyncExternalStore(mockTelemetryStore.subscribe, mockTelemetryStore.getSnapshot);
}
