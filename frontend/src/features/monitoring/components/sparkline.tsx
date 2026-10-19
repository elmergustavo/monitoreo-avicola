import type { Reading, ShedSettings } from '../types';

/** Tiny inline trend with the optimal band, for overview cards. */
export function Sparkline({ readings, settings, className }: { readings: Reading[]; settings: ShedSettings; className?: string }) {
  if (readings.length < 2) return <div className={className} />;
  const width = 240;
  const height = 56;
  const values = readings.map((r) => r.temperature);
  const lo = Math.min(...values, settings.tempMin) - 0.5;
  const hi = Math.max(...values, settings.tempMax) + 0.5;
  const t0 = readings[0].at;
  const t1 = readings.at(-1)!.at;
  const x = (at: number) => ((at - t0) / Math.max(1, t1 - t0)) * width;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const step = Math.max(1, Math.floor(readings.length / 120));
  const path = readings
    .filter((_, i) => i % step === 0 || i === readings.length - 1)
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r.at).toFixed(1)},${y(r.temperature).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <rect x="0" width={width} y={y(settings.tempMax)} height={y(settings.tempMin) - y(settings.tempMax)} className="fill-optimal/12" />
      <path d={path} fill="none" className="stroke-chart-line" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
