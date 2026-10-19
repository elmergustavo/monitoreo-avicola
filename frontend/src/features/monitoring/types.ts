import type { EventType } from '@/lib/types';

export type { EventType };

/** Reading as used by the UI (epoch ms instead of ISO strings). */
export interface Reading {
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
