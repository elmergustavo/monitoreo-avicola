import { TIME_ZONE } from './format';

const dateTime = new Intl.DateTimeFormat('es-GT', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "18 oct 2026, 21:45" in Guatemala time, or a dash. */
export const formatDateTime = (iso: string | null | undefined): string => (iso ? dateTime.format(new Date(iso)) : '—');
