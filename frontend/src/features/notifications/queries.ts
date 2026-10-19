import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type {
  DeliveryItem,
  DeliveryStatus,
  GroupLink,
  NotificationGroup,
  NotificationPreferences,
  NotificationSettings,
  TelegramLink,
  WhatsAppLink,
} from '@/lib/types';

export const channelKeys = {
  settings: ['notification-settings'] as const,
  groups: ['notification-groups'] as const,
  deliveries: (status: DeliveryStatus | 'all') => ['notification-deliveries', status] as const,
};

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Polls while a link dialog is open, to notice when the chat gets linked. */
export function useNotificationSettings(pollMs?: number) {
  return useQuery({
    queryKey: channelKeys.settings,
    queryFn: () => api<NotificationSettings>('/notifications/settings'),
    refetchInterval: pollMs ?? false,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: Partial<NotificationPreferences>) =>
      api<NotificationPreferences>('/notifications/preferences', { method: 'PATCH', body: changes }),
    onMutate: (changes) => {
      const previous = queryClient.getQueryData<NotificationSettings>(channelKeys.settings);
      if (previous) {
        queryClient.setQueryData<NotificationSettings>(channelKeys.settings, {
          ...previous,
          preferences: { ...previous.preferences, ...changes },
        });
      }
      return { previous };
    },
    onError: (err, _changes, context) => {
      if (context?.previous) queryClient.setQueryData(channelKeys.settings, context.previous);
      toast.error(errorMessage(err, 'No se pudo guardar'));
    },
    onSuccess: () => toast.success('Preferencias guardadas', { id: 'prefs-saved' }),
  });
}

export function useTelegramLink() {
  return useMutation({
    mutationFn: () => api<TelegramLink>('/notifications/channels/telegram/link', { method: 'POST' }),
    onError: (err) => toast.error(errorMessage(err, 'No se pudo generar el código')),
  });
}

export function useWhatsAppLink() {
  return useMutation({
    mutationFn: (phone: string) =>
      api<WhatsAppLink>('/notifications/channels/whatsapp/link', { method: 'POST', body: { phone } }),
  });
}

export function useUnlinkChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.settings });
      toast.success('Chat desvinculado');
    },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo desvincular')),
  });
}

export function useSendTest() {
  return useMutation({
    mutationFn: () => api<{ channels: number }>('/notifications/test', { method: 'POST' }),
    onSuccess: ({ channels }) =>
      toast.success(
        channels === 0
          ? 'Prueba enviada a tu campana. Vincula Telegram o WhatsApp para recibirla en el celular.'
          : `Prueba enviada a tu campana y a ${channels} ${channels === 1 ? 'chat' : 'chats'}`,
      ),
    onError: (err) => toast.error(errorMessage(err, 'No se pudo enviar la prueba')),
  });
}

export function useGroups(pollMs?: number) {
  return useQuery({
    queryKey: channelKeys.groups,
    queryFn: () => api<NotificationGroup[]>('/notifications/groups'),
    refetchInterval: pollMs ?? false,
  });
}

export function useGroupLink() {
  return useMutation({
    mutationFn: () => api<GroupLink>('/notifications/groups/link', { method: 'POST' }),
    onError: (err) => toast.error(errorMessage(err, 'No se pudo generar el código')),
  });
}

export function useUnlinkGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/groups/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: channelKeys.groups });
      toast.success('Grupo desvinculado');
    },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo desvincular')),
  });
}

export function useDeliveries(status: DeliveryStatus | 'all') {
  return useQuery({
    queryKey: channelKeys.deliveries(status),
    queryFn: () =>
      api<DeliveryItem[]>('/notifications/deliveries', {
        query: { status: status === 'all' ? undefined : status, limit: 60 },
      }),
    refetchInterval: 20_000,
  });
}

export function useRetryDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/notifications/deliveries/${id}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Se volverá a enviar en unos segundos');
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['notification-deliveries'] }), 2_500);
    },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo reintentar')),
  });
}
