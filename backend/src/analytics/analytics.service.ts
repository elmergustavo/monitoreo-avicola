import { Injectable, NotFoundException } from '@nestjs/common';
import { ALERT_LABELS } from '../alerts/alert-messages.js';
import { DAY_MS, dateKeyGt, startOfDayGt } from '../common/time.util.js';
import { DEFAULT_SETTINGS } from '../devices/devices.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportDataService } from '../reports/report-data.service.js';
import type { PeriodStats } from '../reports/report.types.js';

/** Guatemala calendar day and hour of a reading (UTC-6, no DST). */
const LOCAL_TS = Prisma.sql`((created_at AT TIME ZONE 'UTC') - interval '6 hours')`;
const LOCAL_DAY = Prisma.sql`to_char(${LOCAL_TS}, 'YYYY-MM-DD')`;

/** Explorer resolution: the finest bucket that keeps the chart under ~2 400 points. */
const SERIES_BUCKETS = [60, 300, 600, 1800, 3600];
const SERIES_MAX_POINTS = 2_400;
/** Compare chart: one point every 15 minutes of the day. */
const COMPARE_SLOT_MIN = 15;
/** Irrigation response: readings from 10 min before to 45 min after it turns on. */
const CURVE_FROM_MIN = -10;
const CURVE_TO_MIN = 45;
const MAX_CYCLES = 500;

export interface Thresholds {
  tempMin: number;
  tempMax: number;
  tempAlert: number;
}

const round = (value: number | null, digits = 2) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * Aggregations for the "Análisis" page. Everything is computed in Postgres
 * so the browser only receives what it draws, even for 92 days of data.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportDataService,
  ) {}

  private async context(deviceId: string, fromDate: string, toDate: string) {
    const period = this.reports.resolvePeriod(fromDate, toDate);
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { settings: true },
    });
    if (!device) throw new NotFoundException('Galpón no encontrado');
    const thresholds: Thresholds = device.settings
      ? {
          tempMin: device.settings.tempMin.toNumber(),
          tempMax: device.settings.tempMax.toNumber(),
          tempAlert: device.settings.tempAlert.toNumber(),
        }
      : DEFAULT_SETTINGS;
    // Days before the shed was registered have no data: charts start at its first day.
    const firstDay = new Date(
      Math.min(
        Math.max(period.from.getTime(), startOfDayGt(device.createdAt).getTime()),
        period.to.getTime(),
      ),
    );
    const dataSince = firstDay > period.from ? dateKeyGt(firstDay) : null;
    return { period, device, thresholds, firstDay, dataSince };
  }

  /** Headline numbers for the period and the same number of days right before it. */
  async summary(deviceId: string, fromDate: string, toDate: string) {
    const { period, thresholds, firstDay, dataSince } = await this.context(
      deviceId,
      fromDate,
      toDate,
    );
    const previousTo = new Date(period.from.getTime() - DAY_MS);
    const previousFrom = new Date(period.from.getTime() - period.days * DAY_MS);
    const requester = { name: 'Análisis', email: '' };

    // Nothing to compare against if the shed did not exist yet in the previous period.
    const hasPrevious = dataSince === null;
    const observedDays = Math.max(
      1,
      Math.round((period.to.getTime() - firstDay.getTime()) / DAY_MS),
    );

    const [current, previous, alerts, previousAlerts] = await Promise.all([
      this.reports.build({ fromDate, toDate, deviceId, requester }),
      hasPrevious
        ? this.reports.build({
            fromDate: dateKeyGt(previousFrom),
            toDate: dateKeyGt(previousTo),
            deviceId,
            requester,
          })
        : null,
      this.alertCount(deviceId, period.from, period.to),
      this.alertCount(deviceId, previousFrom, period.from),
    ]);
    const pick = (stats: PeriodStats, days: number, alertCount: number) => ({
      readings: stats.readings,
      average: stats.average,
      min: stats.min,
      max: stats.max,
      optimalShare: stats.optimalShare,
      alertShare: stats.alertShare,
      coverage: stats.coverage,
      irrigationCycles: stats.irrigationCycles,
      irrigationMinutesPerDay: round(stats.irrigationMinutes / days, 1),
      alerts: alertCount,
    });
    const device = current.devices[0];
    return {
      period: { from: period.fromDate, to: period.toDate, days: period.days },
      /** First day with data when the shed started after the period began. */
      dataSince,
      previousPeriod: hasPrevious
        ? { from: dateKeyGt(previousFrom), to: dateKeyGt(previousTo) }
        : null,
      thresholds,
      current: pick(device.totals, observedDays, alerts),
      previous: previous ? pick(previous.devices[0].totals, period.days, previousAlerts) : null,
      hottest: device.hottest,
      coldest: device.coldest,
    };
  }

  private alertCount(deviceId: string, from: Date, to: Date) {
    return this.prisma.alert.count({ where: { deviceId, openedAt: { gte: from, lt: to } } });
  }

  /** Averaged temperature with min/max band, irrigation spans and alerts. */
  async series(deviceId: string, fromDate: string, toDate: string) {
    const { period, thresholds } = await this.context(deviceId, fromDate, toDate);
    const { from, to } = period;
    const rangeSeconds = (to.getTime() - from.getTime()) / 1000;
    const bucket =
      SERIES_BUCKETS.find((seconds) => rangeSeconds / seconds <= SERIES_MAX_POINTS) ??
      SERIES_BUCKETS[SERIES_BUCKETS.length - 1];

    const [points, events, alerts] = await Promise.all([
      this.prisma.$queryRaw<
        { at: Date; average: number; min: number; max: number; irrigation: boolean }[]
      >`
        SELECT date_bin(make_interval(secs => ${bucket}::double precision), created_at, TIMESTAMPTZ '2000-01-01') AS at,
               round(avg(temperature), 2)::float8 AS average,
               min(temperature)::float8 AS min,
               max(temperature)::float8 AS max,
               bool_or(irrigation) AS irrigation
        FROM readings
        WHERE device_id = ${deviceId}::uuid AND created_at >= ${from} AND created_at < ${to}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.event.findMany({
        where: {
          deviceId,
          type: { in: ['irrigation_on', 'irrigation_off'] },
          createdAt: { gte: new Date(from.getTime() - 6 * 3_600_000), lt: to },
        },
        select: { type: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.alert.findMany({
        where: {
          deviceId,
          openedAt: { lt: to },
          OR: [{ resolvedAt: null }, { resolvedAt: { gte: from } }],
        },
        orderBy: { openedAt: 'asc' },
        take: 300,
      }),
    ]);

    // Pair each "on" with the next "off"; a cycle still running ends at the period end (or now).
    const spans: { from: Date; to: Date }[] = [];
    let start: Date | null = null;
    for (const event of events) {
      if (event.type === 'irrigation_on') start ??= event.createdAt;
      else if (start) {
        if (event.createdAt > from)
          spans.push({ from: start < from ? from : start, to: event.createdAt });
        start = null;
      }
    }
    if (start)
      spans.push({
        from: start < from ? from : start,
        to: new Date(Math.min(Date.now(), to.getTime())),
      });

    return {
      bucketSeconds: bucket,
      thresholds,
      points,
      irrigation: spans,
      alerts: alerts.map((alert) => ({
        id: alert.id,
        kind: alert.kind,
        label: ALERT_LABELS[alert.kind],
        severity: alert.severity,
        openedAt: alert.openedAt,
        resolvedAt: alert.resolvedAt,
        temperature:
          alert.peakTemperature?.toNumber() ?? alert.triggerTemperature?.toNumber() ?? null,
      })),
    };
  }

  /** Average temperature for every hour of every day (Guatemala time). */
  async heatmap(deviceId: string, fromDate: string, toDate: string) {
    const { period, thresholds, firstDay } = await this.context(deviceId, fromDate, toDate);
    const cells = await this.prisma.$queryRaw<
      { date: string; hour: number; average: number; max: number; count: number }[]
    >`
      SELECT ${LOCAL_DAY} AS date,
             extract(hour FROM ${LOCAL_TS})::int AS hour,
             round(avg(temperature), 1)::float8 AS average,
             max(temperature)::float8 AS max,
             count(*)::int AS count
      FROM readings
      WHERE device_id = ${deviceId}::uuid AND created_at >= ${period.from} AND created_at < ${period.to}
      GROUP BY 1, 2 ORDER BY 1, 2`;
    return { days: this.dayKeys(firstDay, period.to), thresholds, cells };
  }

  /** Share of each day spent cold, optimal, warm and at alert level. */
  async ranges(deviceId: string, fromDate: string, toDate: string) {
    const { period, thresholds, firstDay } = await this.context(deviceId, fromDate, toDate);
    const { tempMin, tempMax, tempAlert } = thresholds;
    const rows = await this.prisma.$queryRaw<
      { date: string; count: number; cold: number; optimal: number; warm: number; alert: number }[]
    >`
      SELECT ${LOCAL_DAY} AS date,
             count(*)::int AS count,
             count(*) FILTER (WHERE temperature < ${tempMin})::int AS cold,
             count(*) FILTER (WHERE temperature BETWEEN ${tempMin} AND ${tempMax})::int AS optimal,
             count(*) FILTER (WHERE temperature > ${tempMax} AND temperature < ${tempAlert})::int AS warm,
             count(*) FILTER (WHERE temperature >= ${tempAlert})::int AS alert
      FROM readings
      WHERE device_id = ${deviceId}::uuid AND created_at >= ${period.from} AND created_at < ${period.to}
      GROUP BY 1 ORDER BY 1`;
    const byDay = new Map(rows.map((row) => [row.date, row]));
    return {
      thresholds,
      days: this.dayKeys(firstDay, period.to).map((date) => {
        const row = byDay.get(date);
        const share = (value: number) =>
          row && row.count > 0 ? round(value / row.count, 4) : null;
        return {
          date,
          readings: row?.count ?? 0,
          cold: share(row?.cold ?? 0),
          optimal: share(row?.optimal ?? 0),
          warm: share(row?.warm ?? 0),
          alert: share(row?.alert ?? 0),
        };
      }),
    };
  }

  /**
   * How the temperature responds to irrigation: every cycle (temperature when
   * it turned on, 15 minutes later, time to get back to the optimal range)
   * and the average curve around the moment it turns on.
   */
  async irrigation(deviceId: string, fromDate: string, toDate: string) {
    const { period, thresholds } = await this.context(deviceId, fromDate, toDate);
    const { from, to } = period;

    const [cycles, curve] = await Promise.all([
      this.prisma.$queryRaw<
        {
          at: Date;
          ended_at: Date | null;
          duration_min: number | null;
          start_temp: number | null;
          after_temp: number | null;
          back_at: Date | null;
        }[]
      >`
        WITH starts AS (
          SELECT e.created_at AS at,
                 off.created_at AS ended_at,
                 off.duration_min::float8 AS duration_min,
                 (SELECT avg(r.temperature)::float8 FROM readings r
                   WHERE r.device_id = e.device_id
                     AND r.created_at BETWEEN e.created_at - interval '5 minutes' AND e.created_at) AS start_temp
          FROM events e
          LEFT JOIN LATERAL (
            SELECT o.created_at, o.duration_min FROM events o
            WHERE o.device_id = e.device_id AND o.type = 'irrigation_off'
              AND o.created_at > e.created_at AND o.created_at < e.created_at + interval '6 hours'
            ORDER BY o.created_at LIMIT 1
          ) off ON true
          WHERE e.device_id = ${deviceId}::uuid AND e.type = 'irrigation_on'
            AND e.created_at >= ${from} AND e.created_at < ${to}
          ORDER BY e.created_at
          LIMIT ${MAX_CYCLES}
        )
        SELECT s.at, s.ended_at, s.duration_min, s.start_temp,
               (SELECT avg(r.temperature)::float8 FROM readings r
                 WHERE r.device_id = ${deviceId}::uuid
                   AND r.created_at BETWEEN s.at + interval '12 minutes' AND s.at + interval '18 minutes') AS after_temp,
               CASE WHEN s.start_temp > ${thresholds.tempMax} THEN
                 (SELECT min(r.created_at) FROM readings r
                   WHERE r.device_id = ${deviceId}::uuid AND r.created_at > s.at
                     AND r.created_at < s.at + interval '3 hours' AND r.temperature <= ${thresholds.tempMax})
               END AS back_at
        FROM starts s
        ORDER BY s.at`,
      this.prisma.$queryRaw<{ minute: number; delta: number; cycles: number }[]>`
        WITH base AS (
          SELECT e.created_at AS at,
                 (SELECT avg(r.temperature) FROM readings r
                   WHERE r.device_id = e.device_id
                     AND r.created_at BETWEEN e.created_at - interval '5 minutes' AND e.created_at) AS t0
          FROM events e
          WHERE e.device_id = ${deviceId}::uuid AND e.type = 'irrigation_on'
            AND e.created_at >= ${from} AND e.created_at < ${to}
          ORDER BY e.created_at
          LIMIT ${MAX_CYCLES}
        )
        SELECT floor(extract(epoch FROM r.created_at - b.at) / 60)::int AS minute,
               round(avg(r.temperature - b.t0), 2)::float8 AS delta,
               count(DISTINCT b.at)::int AS cycles
        FROM base b
        JOIN readings r ON r.device_id = ${deviceId}::uuid
          AND r.created_at >= b.at + make_interval(mins => ${CURVE_FROM_MIN})
          AND r.created_at < b.at + make_interval(mins => ${CURVE_TO_MIN})
        WHERE b.t0 IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
    ]);

    const views = cycles.map((cycle) => {
      const drop =
        cycle.start_temp !== null && cycle.after_temp !== null
          ? round(cycle.start_temp - cycle.after_temp, 2)
          : null;
      const durationMin =
        cycle.duration_min ??
        (cycle.ended_at
          ? round((cycle.ended_at.getTime() - cycle.at.getTime()) / 60_000, 1)
          : null);
      return {
        at: cycle.at,
        durationMin,
        startTemperature: round(cycle.start_temp, 2),
        after15Temperature: round(cycle.after_temp, 2),
        drop,
        recoveryMin: cycle.back_at
          ? round((cycle.back_at.getTime() - cycle.at.getTime()) / 60_000, 1)
          : null,
        startedHot: cycle.start_temp !== null && cycle.start_temp > thresholds.tempMax,
      };
    });

    const measured = views.filter((c) => c.drop !== null);
    const hot = views.filter((c) => c.startedHot);
    const recovered = hot.filter((c) => c.recoveryMin !== null);
    const average = (values: number[]) =>
      values.length ? round(values.reduce((a, b) => a + b, 0) / values.length, 2) : null;

    return {
      thresholds,
      summary: {
        cycles: views.length,
        measured: measured.length,
        averageDrop: average(measured.map((c) => c.drop!)),
        /** Cycles where the temperature fell at least 0.5 °C in 15 minutes. */
        effectiveShare: measured.length
          ? round(measured.filter((c) => c.drop! >= 0.5).length / measured.length, 3)
          : null,
        startedHot: hot.length,
        averageRecoveryMin: average(recovered.map((c) => c.recoveryMin!)),
        recoveredShare: hot.length ? round(recovered.length / hot.length, 3) : null,
        averageDurationMin: average(
          views.flatMap((c) => (c.durationMin !== null ? [c.durationMin] : [])),
        ),
      },
      curve,
      cycles: views,
    };
  }

  /**
   * The last day of the period against the day before and the average of the
   * 7 days before it, every 15 minutes. With several sheds, also each shed on
   * that day.
   */
  async compare(deviceId: string, fromDate: string, toDate: string) {
    const { period, thresholds, device } = await this.context(deviceId, fromDate, toDate);
    const dayStart = new Date(period.to.getTime() - DAY_MS);
    const weekStart = new Date(dayStart.getTime() - 7 * DAY_MS);
    const slot = Prisma.sql`floor((extract(hour FROM ${LOCAL_TS}) * 60 + extract(minute FROM ${LOCAL_TS})) / ${COMPARE_SLOT_MIN})::int`;

    const [rows, others] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; slot: number; average: number }[]>`
        SELECT ${LOCAL_DAY} AS date, ${slot} AS slot, round(avg(temperature), 2)::float8 AS average
        FROM readings
        WHERE device_id = ${deviceId}::uuid AND created_at >= ${weekStart} AND created_at < ${period.to}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ device_id: string; name: string; slot: number; average: number }[]>`
        SELECT r.device_id, d.name, r.slot, round(avg(r.temperature), 2)::float8 AS average
        FROM (
          SELECT device_id, temperature, ${slot} AS slot FROM readings
          WHERE created_at >= ${dayStart} AND created_at < ${period.to}
        ) r
        JOIN devices d ON d.id = r.device_id AND d.active
        GROUP BY 1, 2, 3`,
    ]);

    const day = dateKeyGt(dayStart);
    const previousDay = dateKeyGt(new Date(dayStart.getTime() - DAY_MS));
    const slots = (24 * 60) / COMPARE_SLOT_MIN;
    const curveOf = (date: string) => {
      const values = new Map(rows.filter((r) => r.date === date).map((r) => [r.slot, r.average]));
      return Array.from({ length: slots }, (_, i) => values.get(i) ?? null);
    };
    const weekAverage = Array.from({ length: slots }, (_, i) => {
      const values = rows.filter((r) => r.slot === i && r.date < day).map((r) => r.average);
      return values.length ? round(values.reduce((a, b) => a + b, 0) / values.length, 2) : null;
    });

    const deviceIds = [...new Set(others.map((r) => r.device_id))];
    return {
      slotMinutes: COMPARE_SLOT_MIN,
      thresholds,
      day,
      previousDay,
      curves: {
        day: curveOf(day),
        previousDay: curveOf(previousDay),
        weekAverage,
      },
      devices:
        deviceIds.length > 1
          ? deviceIds.map((id) => {
              const values = new Map(
                others.filter((r) => r.device_id === id).map((r) => [r.slot, r.average]),
              );
              return {
                id,
                name: others.find((r) => r.device_id === id)!.name,
                current: id === device.id,
                points: Array.from({ length: slots }, (_, i) => values.get(i) ?? null),
              };
            })
          : [],
    };
  }

  private dayKeys(from: Date, to: Date): string[] {
    const keys: string[] = [];
    for (let at = from.getTime(); at < to.getTime(); at += DAY_MS) {
      keys.push(dateKeyGt(new Date(at)));
    }
    return keys;
  }
}
