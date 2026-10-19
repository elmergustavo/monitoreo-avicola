import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { AlertKind, AlertRules, AlertSeverity, AlertStats, AlertView, Device, NotificationItem } from '@/lib/types';
import { queryKeys } from '@/features/monitoring/queries';

export const alertKeys = {
  all: ['alerts'] as const,
  active: ['alerts', 'active'] as const,
  history: (filters: AlertFilters) => ['alerts', 'history', filters] as const,
  stats: (days: number, deviceId?: string) => ['alerts', 'stats', days, deviceId ?? 'all'] as const,
};

export interface AlertFilters {
  status?: 'active' | 'resolved';
  deviceId?: string;
  kind?: AlertKind;
  severity?: AlertSeverity;
}

const HISTORY_PAGE = 30;

/** Alert history, newest first, paged by opening time. */
export function useAlertHistory(filters: AlertFilters) {
  return useInfiniteQuery({
    queryKey: alertKeys.history(filters),
    queryFn: ({ pageParam }) =>
      api<AlertView[]>('/alerts', { query: { ...filters, limit: HISTORY_PAGE, before: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === HISTORY_PAGE ? last.at(-1)?.openedAt : undefined),
  });
}

export function useAlertStats(days: number, deviceId?: string) {
  return useQuery({
    queryKey: alertKeys.stats(days, deviceId),
    queryFn: () => api<AlertStats>('/alerts/stats', { query: { days, deviceId } }),
  });
}

export function useUpdateAlertRules(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rules: AlertRules) => api<Device>(`/devices/${deviceId}/alert-rules`, { method: 'PATCH', body: rules }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Device[]>(queryKeys.devices, (old) => old?.map((d) => (d.id === updated.id ? updated : d)));
    },
  });
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
};

/** Unresolved alerts. Live updates arrive by SSE; the interval is a safety net. */
export function useActiveAlerts(enabled = true) {
  return useQuery({
    queryKey: alertKeys.active,
    queryFn: () => api<AlertView[]>('/alerts', { query: { status: 'active', limit: 100 } }),
    refetchInterval: 60_000,
    enabled,
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: () => api<NotificationItem[]>('/notifications', { query: { limit: 30 } }),
    enabled,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
    select: (data) => data.count,
  });
}

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alert: AlertView) => api<AlertView>(`/alerts/${alert.id}/acknowledge`, { method: 'POST' }),
    onSuccess: (alert) => {
      queryClient.setQueryData<AlertView[]>(alertKeys.active, (old) => old?.map((a) => (a.id === alert.id ? alert : a)));
      toast.success('Quedó registrado que tú la atiendes', { description: `${alert.label} · ${alert.device.name}` });
    },
    onError: (err) => {
      void queryClient.invalidateQueries({ queryKey: alertKeys.all });
      toast.error(errorMessage(err, 'No se pudo registrar'));
    },
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alert: AlertView) => api<AlertView>(`/alerts/${alert.id}/resolve`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: alertKeys.all }),
    onError: (err) => toast.error(errorMessage(err, 'No se pudo cerrar la alerta')),
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onMutate: (id) => {
      const now = new Date().toISOString();
      queryClient.setQueryData<NotificationItem[]>(notificationKeys.list, (old) =>
        old?.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n)),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.unread }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(notificationKeys.unread, { count: 0 });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
