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

/** Temperatures keep the sensor's two decimals (the DS18B20 resolves 0.0625 °C). */
const tempFormat = new Intl.NumberFormat('es-GT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatTime = (at: number): string => timeFormat.format(at);
export const formatShortDay = (at: number): string => shortDayFormat.format(at);
export const formatTemp = (value: number): string => tempFormat.format(value);
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

/** "45 min", "2 h 10 min", "1 d 4 h". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 1) return '< 1 min';
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  if (hours < 24) return total % 60 === 0 ? `${hours} h` : `${hours} h ${total % 60} min`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days} d` : `${days} d ${hours % 24} h`;
}

/** "a los 12 min", or "de inmediato" under a minute. */
export const formatAfter = (minutes: number): string => (minutes < 0.5 ? 'de inmediato' : `a los ${formatDuration(minutes)}`);
