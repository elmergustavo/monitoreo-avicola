import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { API_URL, getAccessToken, refreshAccessToken } from '@/lib/api';
import type { Device, DeviceEventDto } from '@/lib/types';
import { LiveContext, type LiveStatus } from './live-context';
import { queryKeys, toEvent } from './queries';
import type { DeviceEvent, Reading } from './types';

const DAY_MS = 24 * 3_600_000;

interface ReadingMessage {
  deviceId: string;
  reading: { temperature: number; humidity: number | null; irrigation: boolean; createdAt: string };
}

interface EventMessage {
  deviceId: string;
  event: DeviceEventDto;
}

/**
 * Keeps a server-sent events connection to /stream and merges each new
 * reading/event into the React Query cache, so every screen updates live.
 * Uses fetch (not EventSource) to send the Authorization header.
 */
export function LiveProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('off');
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let attempt = 0;

    const onReading = ({ deviceId, reading }: ReadingMessage) => {
      const point: Reading = { at: Date.parse(reading.createdAt), temperature: reading.temperature, irrigation: reading.irrigation };
      queryClient.setQueryData<Reading[]>(queryKeys.last24h(deviceId), (old) =>
        old ? [...old.filter((r) => r.at >= point.at - DAY_MS), point] : old,
      );
      queryClient.setQueryData<Device[]>(queryKeys.devices, (old) =>
        old?.map((d) =>
          d.id === deviceId ? { ...d, online: true, lastSeenAt: reading.createdAt, lastReading: reading } : d,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(deviceId) });
    };

    const onEvent = ({ deviceId, event }: EventMessage) => {
      queryClient.setQueryData<DeviceEvent[]>(queryKeys.events(deviceId), (old) =>
        old ? [toEvent(event), ...old] : old,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary(deviceId) });
    };

    const dispatch = (type: string, data: string) => {
      setLastMessageAt(Date.now());
      if (type === 'reading') onReading(JSON.parse(data) as ReadingMessage);
      if (type === 'event') onEvent(JSON.parse(data) as EventMessage);
    };

    async function connect(): Promise<void> {
      const token = getAccessToken() ?? (await refreshAccessToken());
      const response = await fetch(`${API_URL}/stream`, {
        headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal,
      });
      if (response.status === 401) {
        await refreshAccessToken();
        throw new Error('unauthorized');
      }
      if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

      setStatus('open');
      attempt = 0;
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream closed');
        buffer += value;
        let separator: number;
        while ((separator = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          let type = 'message';
          const data: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) type = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
          }
          if (data.length > 0) dispatch(type, data.join('\n'));
        }
      }
    }

    void (async () => {
      setStatus('connecting');
      while (!controller.signal.aborted) {
        try {
          await connect();
        } catch {
          if (controller.signal.aborted) return;
          setStatus('reconnecting');
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, Math.min(15_000, 1_000 * 2 ** (attempt - 1))));
          // After a gap, refresh everything so nothing is missed.
          if (attempt === 1) void queryClient.invalidateQueries();
        }
      }
    })();

    return () => {
      controller.abort();
      setStatus('off');
    };
  }, [enabled, queryClient]);

  return <LiveContext.Provider value={{ status, lastMessageAt }}>{children}</LiveContext.Provider>;
}
