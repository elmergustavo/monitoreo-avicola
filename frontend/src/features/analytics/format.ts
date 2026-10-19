import { saveFile } from '@/lib/api';
import type { EChartInstance } from '@/components/echart';

// Calendar day keys (YYYY-MM-DD) are already Guatemala days: format them as UTC to avoid shifting.
const dayKey = new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const dayKeyShort = new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const dayKeyLong = new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

const parseKey = (key: string) => new Date(`${key}T12:00:00Z`);
const tidy = (text: string) => text.replace(/\./g, '').replace(/,/g, '');

/** "lun 13 oct" */
export const formatDayKey = (key: string) => tidy(dayKey.format(parseKey(key)));
/** "13 oct" */
export const formatDayKeyShort = (key: string) => tidy(dayKeyShort.format(parseKey(key)));
/** "lunes 13 de octubre" */
export const formatDayKeyLong = (key: string) => dayKeyLong.format(parseKey(key));

/** Slot index of the day → "06:15". */
export const slotLabel = (slot: number, slotMinutes: number) => {
  const minutes = slot * slotMinutes;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

export const percent = (share: number | null | undefined, digits = 0) =>
  share === null || share === undefined ? '—' : `${(share * 100).toFixed(digits)} %`;

/** Signed number with a real minus sign: "+0.8", "−1.2". */
export const signed = (value: number, digits = 1) =>
  `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(digits)}`;

/** Downloads the chart as a PNG on the card background. */
export function downloadChartImage(chart: EChartInstance | null, fileName: string, background: string) {
  if (!chart) return;
  const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: background });
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.png`;
  document.body.append(link);
  link.click();
  link.remove();
}

/** Downloads rows as a CSV that Excel opens correctly (UTF-8 BOM, semicolons for es locales). */
export function downloadCsv(fileName: string, header: string[], rows: (string | number | null)[][]) {
  const escape = (value: string | number | null) => {
    if (value === null) return '';
    const text = typeof value === 'number' ? String(value).replace('.', ',') : value;
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = [header, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
  saveFile({ blob: new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' }), fileName: `${fileName}.csv`, code: null });
}
