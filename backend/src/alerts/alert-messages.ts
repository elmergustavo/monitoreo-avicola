import { formatTime } from '../common/time.util.js';
import type { AlertKind, NotificationKind } from '../generated/prisma/client.js';

/** Spanish names, shared by the inbox and (later) Telegram and WhatsApp. */
export const ALERT_LABELS: Record<AlertKind, string> = {
  heat_no_irrigation: 'Calor sin riego',
  prolonged_irrigation: 'Riego prolongado',
  sensor_error: 'Error del sensor',
  device_offline: 'Galpón sin conexión',
  sustained_heat: 'Calor sostenido',
  sustained_cold: 'Frío sostenido',
};

export interface AlertMessageInput {
  kind: AlertKind;
  deviceName: string;
  openedAt: Date;
  resolvedAt?: Date | null;
  triggerTemperature: number | null;
  peakTemperature: number | null;
  resolution?: string | null;
  acknowledgedByName?: string | null;
  thresholds: { tempMin: number; tempAlert: number };
  rules: {
    sustainedHeatMin: number;
    sustainedColdMin: number;
    offlineAfterMin: number;
    prolongedIrrigationMin: number;
  };
}

const temp = (value: number | null) => (value === null ? '' : `${value.toFixed(1)} °C`);

function describe(input: AlertMessageInput): string {
  const since = `desde las ${formatTime(input.openedAt)}`;
  const t = temp(input.triggerTemperature);
  switch (input.kind) {
    case 'heat_no_irrigation':
      return `${t ? `${t} ` : ''}${since} y el riego no se ha encendido (alerta: ${input.thresholds.tempAlert} °C).`;
    case 'sustained_heat':
      return `Más de ${input.rules.sustainedHeatMin} min a ${input.thresholds.tempAlert} °C o más${t ? ` (llegó a ${t})` : ''}.`;
    case 'sustained_cold':
      return `Más de ${input.rules.sustainedColdMin} min por debajo de ${input.thresholds.tempMin} °C${t ? ` (bajó a ${t})` : ''}.`;
    case 'prolonged_irrigation':
      return `El riego lleva más de ${input.rules.prolongedIrrigationMin} min encendido sin apagarse. Revisa la válvula o el control del riego.`;
    case 'sensor_error':
      return `El sensor de temperatura no responde ${since}. Revisa el cable del sensor.`;
    case 'device_offline':
      return `No llegan datos ${since}. Puede ser un corte de luz o de internet en el galpón.`;
  }
}

function minutesBetween(from: Date, to: Date): string {
  const total = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function buildAlertMessage(
  phase: Extract<
    NotificationKind,
    'alert_opened' | 'alert_reminder' | 'alert_escalated' | 'alert_resolved'
  >,
  input: AlertMessageInput,
): { title: string; body: string } {
  const label = ALERT_LABELS[input.kind];
  const where = input.deviceName;

  switch (phase) {
    case 'alert_opened':
      return { title: `${label} · ${where}`, body: describe(input) };
    case 'alert_reminder':
      return {
        title: `Sigue sin atenderse: ${label} · ${where}`,
        body: `${describe(input)} Nadie la ha atendido todavía.`,
      };
    case 'alert_escalated':
      return {
        title: `Sin atender: ${label} · ${where}`,
        body: `${describe(input)} Lleva ${minutesBetween(input.openedAt, new Date())} sin que nadie la atienda.`,
      };
    case 'alert_resolved': {
      const duration = input.resolvedAt ? minutesBetween(input.openedAt, input.resolvedAt) : null;
      const details = [
        input.resolution,
        duration ? `Duró ${duration}` : null,
        input.peakTemperature !== null && input.kind !== 'sustained_cold'
          ? `Máxima ${temp(input.peakTemperature)}`
          : null,
        input.acknowledgedByName ? `Atendió ${input.acknowledgedByName}` : null,
      ].filter(Boolean);
      return { title: `Normalizado: ${label} · ${where}`, body: `${details.join(' · ')}.` };
    }
  }
}
