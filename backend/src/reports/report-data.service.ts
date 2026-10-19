import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { dateKeyGt, DAY_MS, GT_OFFSET_MS } from '../common/time.util.js';
import { DEFAULT_SETTINGS } from '../devices/devices.service.js';
import { Prisma, type EventType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ChartPoint,
  DailyStats,
  DeviceReport,
  PeriodStats,
  ReportData,
  ReportReading,
  Thresholds,
} from './report.types.js';

export const MAX_REPORT_DAYS = 92;
/** Readings are exported one by one up to this range; beyond it, as 5-minute averages. */
const RAW_READINGS_MAX_DAYS = 7;
const SLOT_SECONDS = 5 * 60;
const MAX_EVENTS = 5000;
const CHART_TARGET_POINTS = 300;
const CHART_BUCKETS = [300, 900, 1800, 3600, 7200, 10800, 21600, 43200];

/** Local (UTC-6) calendar day of created_at, as text. Matches dateKeyGt in time.util. */
const LOCAL_DAY = Prisma.sql`to_char((created_at AT TIME ZONE 'UTC') - interval '6 hours', 'YYYY-MM-DD')`;

interface DailyReadingRow {
  day: string;
  count: number;
  total: number;
  min: number;
  max: number;
  in_range: number;
  below: number;
  above: number;
  alert: number;
  slots: number;
}

interface DailyEventRow {
  day: string;
  type: EventType;
  count: number;
  minutes: number;
}

interface Requester {
  name: string;
  email: string;
}

@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Converts inclusive local calendar days into a UTC [from, to) window. */
  resolvePeriod(fromDate: string, toDate: string): ReportData['period'] {
    const from = startOfLocalDate(fromDate);
    const lastDay = startOfLocalDate(toDate);
    if (!from || !lastDay) throw new BadRequestException('Las fechas no son válidas');
    if (lastDay < from)
      throw new BadRequestException('La fecha inicial debe ser anterior a la final');
    const to = new Date(lastDay.getTime() + DAY_MS);
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
    if (days > MAX_REPORT_DAYS)
      throw new BadRequestException(`El reporte puede cubrir hasta ${MAX_REPORT_DAYS} días`);
    if (from.getTime() > Date.now())
      throw new BadRequestException('El periodo empieza en el futuro');
    return { from, to, fromDate, toDate, days };
  }

  async build(params: {
    fromDate: string;
    toDate: string;
    deviceId?: string;
    requester: Requester;
  }): Promise<ReportData> {
    const period = this.resolvePeriod(params.fromDate, params.toDate);
    const devices = await this.prisma.device.findMany({
      where: params.deviceId ? { id: params.deviceId } : { active: true },
      include: { settings: true },
      orderBy: { name: 'asc' },
    });
    if (params.deviceId && devices.length === 0)
      throw new NotFoundException('Galpón no encontrado');

    const generatedAt = new Date();
    return {
      code: reportCode(generatedAt),
      generatedAt,
      generatedBy: params.requester,
      period,
      scopeDeviceId: params.deviceId ?? null,
      devices: await Promise.all(
        devices.map((device) =>
          this.buildDevice(
            {
              id: device.id,
              name: device.name,
              shed: device.shed,
              createdAt: device.createdAt,
              thresholds: device.settings
                ? {
                    tempMin: device.settings.tempMin.toNumber(),
                    tempMax: device.settings.tempMax.toNumber(),
                    tempAlert: device.settings.tempAlert.toNumber(),
                  }
                : DEFAULT_SETTINGS,
            },
            period,
            generatedAt,
          ),
        ),
      ),
    };
  }

  /** Last reports downloaded by a user, from the audit log. */
  async recentExports(userId: string, limit = 8) {
    const entries = await this.prisma.auditLog.findMany({
      where: { userId, action: 'report.exported' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const deviceIds = [...new Set(entries.map((e) => e.entityId).filter(isDefined))];
    const devices = await this.prisma.device.findMany({
      where: { id: { in: deviceIds } },
      select: { id: true, name: true },
    });
    const names = new Map(devices.map((d) => [d.id, d.name]));

    return entries.map((entry) => {
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      const text = (key: string) => (typeof meta[key] === 'string' ? (meta[key] as string) : null);
      return {
        id: entry.id,
        createdAt: entry.createdAt,
        code: text('code'),
        format: text('format'),
        from: text('from'),
        to: text('to'),
        deviceId: entry.entityId,
        deviceName: entry.entityId ? (names.get(entry.entityId) ?? 'Galpón eliminado') : null,
      };
    });
  }

  /** Every reading in the period (5-minute averages for long periods), for the spreadsheet. */
  async readings(report: ReportData): Promise<{ bucketSeconds: number; rows: ReportReading[] }> {
    const { from, to, days } = report.period;
    const bucketSeconds = days <= RAW_READINGS_MAX_DAYS ? 0 : SLOT_SECONDS;
    const rows: ReportReading[] = [];

    for (const device of report.devices) {
      if (bucketSeconds === 0) {
        const raw = await this.prisma.reading.findMany({
          where: { deviceId: device.id, createdAt: { gte: from, lt: to } },
          select: { createdAt: true, temperature: true, irrigation: true },
          orderBy: { createdAt: 'asc' },
        });
        for (const r of raw) {
          const temperature = r.temperature.toNumber();
          rows.push({
            at: r.createdAt,
            deviceName: device.name,
            temperature,
            min: temperature,
            max: temperature,
            irrigation: r.irrigation,
          });
        }
      } else {
        const points = await this.bucketed(device.id, from, to, bucketSeconds);
        for (const p of points) {
          rows.push({
            at: p.at,
            deviceName: device.name,
            temperature: p.average,
            min: p.min,
            max: p.max,
            irrigation: p.irrigation,
          });
        }
      }
    }
    return { bucketSeconds, rows };
  }

  private async buildDevice(
    device: { id: string; name: string; shed: string; createdAt: Date; thresholds: Thresholds },
    period: ReportData['period'],
    now: Date,
  ): Promise<DeviceReport> {
    const { from, to } = period;
    const { tempMin, tempMax, tempAlert } = device.thresholds;
    const where = { deviceId: device.id, createdAt: { gte: from, lt: to } };
    const rangeSeconds = (to.getTime() - from.getTime()) / 1000;
    const chartBucket =
      CHART_BUCKETS.find((seconds) => rangeSeconds / seconds <= CHART_TARGET_POINTS) ??
      CHART_BUCKETS[CHART_BUCKETS.length - 1];

    const [readingRows, eventRows, coldest, hottest, chartPoints, events] = await Promise.all([
      this.prisma.$queryRaw<DailyReadingRow[]>`
        SELECT ${LOCAL_DAY} AS day,
               count(*)::int AS count,
               sum(temperature)::float8 AS total,
               min(temperature)::float8 AS min,
               max(temperature)::float8 AS max,
               count(*) FILTER (WHERE temperature BETWEEN ${tempMin} AND ${tempMax})::int AS in_range,
               count(*) FILTER (WHERE temperature < ${tempMin})::int AS below,
               count(*) FILTER (WHERE temperature > ${tempMax})::int AS above,
               count(*) FILTER (WHERE temperature >= ${tempAlert})::int AS alert,
               count(DISTINCT date_bin(interval '5 minutes', created_at, TIMESTAMPTZ '2000-01-01'))::int AS slots
        FROM readings
        WHERE device_id = ${device.id}::uuid AND created_at >= ${from} AND created_at < ${to}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<DailyEventRow[]>`
        SELECT ${LOCAL_DAY} AS day,
               type,
               count(*)::int AS count,
               coalesce(sum(duration_min), 0)::float8 AS minutes
        FROM events
        WHERE device_id = ${device.id}::uuid AND created_at >= ${from} AND created_at < ${to}
        GROUP BY 1, 2`,
      this.prisma.reading.findFirst({
        where,
        orderBy: [{ temperature: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.reading.findFirst({
        where,
        orderBy: [{ temperature: 'desc' }, { createdAt: 'asc' }],
      }),
      this.bucketed(device.id, from, to, chartBucket),
      this.prisma.event.findMany({ where, orderBy: { createdAt: 'asc' }, take: MAX_EVENTS + 1 }),
    ]);

    // One row per calendar day of the period, including days without data.
    const readingsByDay = new Map(readingRows.map((row) => [row.day, row]));
    const eventsByDay = new Map<string, DailyEventRow[]>();
    for (const row of eventRows)
      eventsByDay.set(row.day, [...(eventsByDay.get(row.day) ?? []), row]);

    const daily: DailyStats[] = [];
    for (let start = from.getTime(); start < to.getTime(); start += DAY_MS) {
      const date = dateKeyGt(new Date(start));
      const window = observedWindow(start, start + DAY_MS, device.createdAt, now);
      daily.push({
        date,
        ...toStats(
          [readingsByDay.get(date)].filter(isDefined),
          eventsByDay.get(date) ?? [],
          window,
        ),
      });
    }

    const totals = toStats(
      readingRows,
      eventRows,
      observedWindow(from.getTime(), to.getTime(), device.createdAt, now),
    );
    const eventsTruncated = events.length > MAX_EVENTS;

    return {
      id: device.id,
      name: device.name,
      shed: device.shed,
      thresholds: device.thresholds,
      totals,
      coldest: coldest
        ? { temperature: coldest.temperature.toNumber(), at: coldest.createdAt }
        : null,
      hottest: hottest
        ? { temperature: hottest.temperature.toNumber(), at: hottest.createdAt }
        : null,
      daily,
      chart: {
        bucketSeconds: chartBucket,
        points: chartPoints.map(({ at, average, min, max }) => ({ at, average, min, max })),
      },
      events: events.slice(0, MAX_EVENTS).map((event) => ({
        at: event.createdAt,
        type: event.type,
        temperature: event.temperature?.toNumber() ?? null,
        durationMin: event.durationMin?.toNumber() ?? null,
      })),
      eventsTruncated,
    };
  }

  private bucketed(
    deviceId: string,
    from: Date,
    to: Date,
    bucketSeconds: number,
  ): Promise<Array<ChartPoint & { irrigation: boolean }>> {
    return this.prisma.$queryRaw`
      SELECT date_bin(make_interval(secs => ${bucketSeconds}::double precision), created_at, TIMESTAMPTZ '2000-01-01') AS at,
             round(avg(temperature), 2)::float8 AS average,
             min(temperature)::float8 AS min,
             max(temperature)::float8 AS max,
             bool_or(irrigation) AS irrigation
      FROM readings
      WHERE device_id = ${deviceId}::uuid AND created_at >= ${from} AND created_at < ${to}
      GROUP BY 1
      ORDER BY 1`;
  }
}

/** Seconds of the window during which the shed could have reported (after it was registered, not in the future). */
function observedWindow(start: number, end: number, createdAt: Date, now: Date): number {
  const effectiveStart = Math.max(start, createdAt.getTime());
  const effectiveEnd = Math.min(end, now.getTime());
  return Math.max(0, (effectiveEnd - effectiveStart) / 1000);
}

function toStats(
  readings: DailyReadingRow[],
  events: DailyEventRow[],
  windowSeconds: number,
): PeriodStats {
  const count = sum(readings, (r) => r.count);
  const share = (value: number) => (count > 0 ? value / count : null);
  const expectedSlots = Math.ceil(windowSeconds / SLOT_SECONDS);
  const eventsOf = (type: EventType) => events.filter((e) => e.type === type);

  return {
    readings: count,
    average: count > 0 ? round2(sum(readings, (r) => r.total) / count) : null,
    min: readings.length > 0 ? Math.min(...readings.map((r) => r.min)) : null,
    max: readings.length > 0 ? Math.max(...readings.map((r) => r.max)) : null,
    optimalShare: share(sum(readings, (r) => r.in_range)),
    belowShare: share(sum(readings, (r) => r.below)),
    aboveShare: share(sum(readings, (r) => r.above)),
    alertShare: share(sum(readings, (r) => r.alert)),
    coverage: expectedSlots > 0 ? Math.min(1, sum(readings, (r) => r.slots) / expectedSlots) : null,
    irrigationCycles: sum(eventsOf('irrigation_off'), (e) => e.count),
    irrigationMinutes: round2(sum(eventsOf('irrigation_off'), (e) => e.minutes)),
    heatAlerts: sum(eventsOf('heat_alert_no_irrigation'), (e) => e.count),
    prolongedIrrigationAlerts: sum(eventsOf('prolonged_irrigation_alert'), (e) => e.count),
    sensorErrors: sum(eventsOf('sensor_error'), (e) => e.count),
  };
}

/** Midnight in Guatemala for a YYYY-MM-DD string, or null if the date does not exist. */
function startOfLocalDate(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const date = new Date(utcMidnight - GT_OFFSET_MS);
  return Number.isNaN(utcMidnight) || dateKeyGt(date) !== value ? null : date;
}

/** e.g. LS-20261019-1532-7F3 */
function reportCode(at: Date): string {
  const local = new Date(at.getTime() + GT_OFFSET_MS).toISOString();
  const stamp = `${local.slice(0, 10).replaceAll('-', '')}-${local.slice(11, 16).replace(':', '')}`;
  return `LS-${stamp}-${randomBytes(2).toString('hex').slice(0, 3).toUpperCase()}`;
}

const sum = <T>(items: T[], pick: (item: T) => number) =>
  items.reduce((total, item) => total + pick(item), 0);
const round2 = (value: number) => Math.round(value * 100) / 100;
const isDefined = <T>(value: T | null | undefined): value is T =>
  value !== undefined && value !== null;
