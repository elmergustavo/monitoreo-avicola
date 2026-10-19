/**
 * Report periods as Guatemala calendar days (YYYY-MM-DD, inclusive). The API
 * receives the same day strings, so no time zone math leaves this file.
 */
export const MAX_REPORT_DAYS = 92;

const GT_OFFSET_MS = -6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

export const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: 'last7', label: 'Últimos 7 días' },
  { key: 'last30', label: 'Últimos 30 días' },
  { key: 'thisMonth', label: 'Este mes' },
  { key: 'lastMonth', label: 'Mes anterior' },
  { key: 'custom', label: 'Personalizado' },
];

const toKey = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10);
const fromKey = (key: string) => Date.parse(`${key}T00:00:00Z`);

/** Today's date in Guatemala. */
export const todayGt = (now = Date.now()) => toKey(now + GT_OFFSET_MS);

export const addDays = (key: string, days: number) => toKey(fromKey(key) + days * DAY_MS);

export function presetRange(preset: Exclude<PresetKey, 'custom'>, now = Date.now()): DateRange {
  const today = todayGt(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'thisMonth':
      return { from: monthStart, to: today };
    case 'lastMonth': {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
  }
}

export const daysInRange = ({ from, to }: DateRange) => Math.round((fromKey(to) - fromKey(from)) / DAY_MS) + 1;

/** Problem with a range, in words, or null if the API will accept it. */
export function validateRange(range: DateRange, now = Date.now()): string | null {
  if (!range.from || !range.to) return 'Elige la fecha inicial y la final.';
  if (range.to < range.from) return 'La fecha final debe ser posterior a la inicial.';
  if (range.from > todayGt(now)) return 'El periodo no puede empezar en el futuro.';
  if (daysInRange(range) > MAX_REPORT_DAYS) return `El reporte puede cubrir hasta ${MAX_REPORT_DAYS} días.`;
  return null;
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "13 al 19 de octubre de 2026", "28 de septiembre al 4 de octubre de 2026"... */
export function describeRange({ from, to }: DateRange): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (from === to) return `${fd} de ${MONTHS[fm - 1]} de ${fy}`;
  if (fy === ty && fm === tm) return `${fd} al ${td} de ${MONTHS[tm - 1]} de ${ty}`;
  if (fy === ty) return `${fd} de ${MONTHS[fm - 1]} al ${td} de ${MONTHS[tm - 1]} de ${ty}`;
  return `${fd} de ${MONTHS[fm - 1]} de ${fy} al ${td} de ${MONTHS[tm - 1]} de ${ty}`;
}
