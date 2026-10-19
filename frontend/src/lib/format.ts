/** All dates come from the API in UTC and are shown in Guatemala time. */
export const TIME_ZONE = 'America/Guatemala';
/** Guatemala does not observe DST: it is always UTC-6. */
const GT_OFFSET_MS = -6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormat = new Intl.DateTimeFormat('es-GT', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dayFormat = new Intl.DateTimeFormat('es-GT', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const shortDayFormat = new Intl.DateTimeFormat('es-GT', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
});

const numberFormat = new Intl.NumberFormat('es-GT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const formatTime = (at: number): string => timeFormat.format(at);
export const formatShortDay = (at: number): string => shortDayFormat.format(at);
export const formatTemp = (value: number): string => numberFormat.format(value);
export const formatMinutes = (value: number): string =>
  value >= 60 ? `${Math.floor(value / 60)} h ${Math.round(value % 60)} min` : `${numberFormat.format(value)} min`;

/** Start of the current day in Guatemala, as epoch ms. */
export function startOfDayGt(at: number): number {
  return Math.floor((at + GT_OFFSET_MS) / DAY_MS) * DAY_MS - GT_OFFSET_MS;
}

/** "Hoy", "Ayer" or a short date, relative to now in Guatemala. */
export function formatDayLabel(at: number, now = Date.now()): string {
  const diffDays = Math.round((startOfDayGt(now) - startOfDayGt(at)) / DAY_MS);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  const label = dayFormat.format(at);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}
