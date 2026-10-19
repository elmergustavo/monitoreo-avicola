import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DaySummaryDto, Device, DeviceEventDto, ReadingsResponse } from '@/lib/types';
import type { DeviceEvent, Reading } from './types';

const HOUR_MS = 3_600_000;

export const queryKeys = {
  devices: ['devices'] as const,
  last24h: (id: string) => ['readings', id, '24h'] as const,
  range: (id: string, range: string) => ['readings', id, range] as const,
  events: (id: string) => ['events', id] as const,
  summary: (id: string) => ['summary', id] as const,
};

export const toEvent = (dto: DeviceEventDto): DeviceEvent => ({
  id: dto.id,
  at: Date.parse(dto.createdAt),
  type: dto.type,
  temperature: dto.temperature,
  durationMin: dto.durationMin,
});

const toReadings = (response: ReadingsResponse): Reading[] =>
  response.points.map((p) => ({ at: Date.parse(p.at), temperature: p.temperature, irrigation: p.irrigation }));

export function useDevices() {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: () => api<Device[]>('/devices'),
    refetchInterval: 60_000,
  });
}

/** Last 24 h of raw readings; kept current by the live stream. */
export function useLast24h(deviceId: string) {
  return useQuery({
    queryKey: queryKeys.last24h(deviceId),
    queryFn: async () =>
      toReadings(
        await api<ReadingsResponse>(`/devices/${deviceId}/readings`, {
          query: { from: new Date(Date.now() - 24 * HOUR_MS).toISOString() },
        }),
      ),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

/** Longer ranges come averaged in buckets from the API. */
export function useReadingsRange(deviceId: string, days: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.range(deviceId, `${days}d`),
    queryFn: async () =>
      toReadings(
        await api<ReadingsResponse>(`/devices/${deviceId}/readings`, {
          query: { from: new Date(Date.now() - days * 24 * HOUR_MS).toISOString() },
        }),
      ),
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: enabled ? 5 * 60_000 : false,
  });
}

export function useEvents(deviceId: string) {
  return useQuery({
    queryKey: queryKeys.events(deviceId),
    queryFn: async () =>
      (await api<DeviceEventDto[]>(`/devices/${deviceId}/events`, { query: { limit: 60 } })).map(toEvent),
    staleTime: 5 * 60_000,
  });
}

export function useSummary(deviceId: string) {
  return useQuery({
    queryKey: queryKeys.summary(deviceId),
    queryFn: () => api<DaySummaryDto>(`/devices/${deviceId}/summary`),
    refetchInterval: 60_000,
  });
}
