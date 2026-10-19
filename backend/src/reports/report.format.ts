import { GT_OFFSET_MS } from '../common/time.util.js';
import type { EventType } from '../generated/prisma/client.js';
import type { ReportData } from './report.types.js';

export const COMPANY_NAME = 'Granjas Avícolas La Sierra';
export const SYSTEM_NAME = 'Sistema de monitoreo de galpones';
export const REPORT_TITLE = 'Reporte de temperatura y riego';
export const TIMEZONE_LABEL = 'Hora de Guatemala (UTC-6)';

/** Brand palette (hex equivalents of the dashboard's oklch tokens). */
export const BRAND = {
  primary: '#23593D',
  primarySoft: '#E4F1E8',
  ink: '#211C16',
  muted: '#675F56',
  border: '#E1DCD4',
  paper: '#F8F5F0',
  zebra: '#FBF9F6',
  cool: '#2B7F9C',
  optimal: '#2E854D',
  warm: '#D6810C',
  alert: '#CC361E',
  water: '#2382BA',
} as const;

export const EVENT_LABELS: Record<EventType, string> = {
  irrigation_on: 'Riego encendido',
  irrigation_off: 'Riego apagado',
  heat_alert_no_irrigation: 'Alerta: calor sin riego',
  prolonged_irrigation_alert: 'Alerta: riego prolongado',
  sensor_error: 'Error del sensor',
};

export const ALERT_EVENT_TYPES: EventType[] = [
  'heat_alert_no_irrigation',
  'prolonged_irrigation_alert',
  'sensor_error',
];

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/**
 * Same instant shifted to Guatemala wall-clock time and expressed in UTC
 * fields. Spreadsheet cells store wall-clock time, so dates go in like this.
 */
export const toLocalWallClock = (at: Date) => new Date(at.getTime() + GT_OFFSET_MS);

const parts = (at: Date) => {
  const local = toLocalWallClock(at);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
    hh: String(local.getUTCHours()).padStart(2, '0'),
    mm: String(local.getUTCMinutes()).padStart(2, '0'),
  };
};

const pad = (value: number) => String(value).padStart(2, '0');

/** 19/10/2026 */
export function formatDate(at: Date): string {
  const p = parts(at);
  return `${pad(p.day)}/${pad(p.month + 1)}/${p.year}`;
}

/** 19/10/2026 15:32 */
export const formatDateTime = (at: Date) => `${formatDate(at)} ${formatTime(at)}`;

/** 15:32 */
export function formatTime(at: Date): string {
  const p = parts(at);
  return `${p.hh}:${p.mm}`;
}

/** "19 de octubre de 2026" */
export function formatLongDate(at: Date): string {
  const p = parts(at);
  return `${p.day} de ${MONTHS[p.month]} de ${p.year}`;
}

/** "lun 19/10" for a YYYY-MM-DD local date. */
export function formatDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS_SHORT[weekday]} ${pad(day)}/${pad(month)}`;
}

/** "1 al 18 de octubre de 2026", "28 de septiembre al 4 de octubre de 2026", ... */
export function formatPeriod(period: ReportData['period']): string {
  const [fy, fm, fd] = period.fromDate.split('-').map(Number);
  const [ty, tm, td] = period.toDate.split('-').map(Number);
  if (period.fromDate === period.toDate) return `${fd} de ${MONTHS[fm - 1]} de ${fy}`;
  if (fy === ty && fm === tm) return `${fd} al ${td} de ${MONTHS[tm - 1]} de ${ty}`;
  if (fy === ty) return `${fd} de ${MONTHS[fm - 1]} al ${td} de ${MONTHS[tm - 1]} de ${ty}`;
  return `${fd} de ${MONTHS[fm - 1]} de ${fy} al ${td} de ${MONTHS[tm - 1]} de ${ty}`;
}

export function formatTemp(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} °C`;
}

export function formatPercent(value: number | null, digits = 0): string {
  return value === null ? '—' : `${(value * 100).toFixed(digits)} %`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('es-GT');
}

/** "2 h 15 min", "45 min" */
export function formatMinutes(value: number): string {
  const total = Math.round(value);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** File name without extension, e.g. reporte-galpon-1_2026-10-01_2026-10-18 */
export function reportFileName(report: ReportData): string {
  const scope =
    report.scopeDeviceId && report.devices[0]
      ? slugify(report.devices[0].name)
      : 'todos-los-galpones';
  const range =
    report.period.fromDate === report.period.toDate
      ? report.period.fromDate
      : `${report.period.fromDate}_${report.period.toDate}`;
  return `reporte-${scope}_${range}`;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
