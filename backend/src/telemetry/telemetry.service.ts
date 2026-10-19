import { BadRequestException, Injectable } from '@nestjs/common';
import { toNumber } from '../common/decimal.util.js';
import { dateKeyGt, DAY_MS, startOfDayGt } from '../common/time.util.js';
import { DEFAULT_SETTINGS, DevicesService } from '../devices/devices.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_RANGE_MS = 92 * DAY_MS;

/** Raw readings up to 24 h (~2,880 points); larger ranges are averaged into buckets. */
function bucketSecondsFor(rangeMs: number): number {
  if (rangeMs <= DAY_MS) return 0;
  if (rangeMs <= 7 * DAY_MS) return 5 * 60;
  if (rangeMs <= 31 * DAY_MS) return 30 * 60;
  return 2 * 60 * 60;
}

export interface ReadingPoint {
  at: Date;
  temperature: number;
  min: number;
  max: number;
  irrigation: boolean;
}

@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DevicesService,
  ) {}

  async readings(deviceId: string, fromIso: string, toIso?: string) {
    const from = new Date(fromIso);
    const to = toIso ? new Date(toIso) : new Date();
    const rangeMs = to.getTime() - from.getTime();
    if (rangeMs <= 0) throw new BadRequestException('"from" debe ser anterior a "to"');
    if (rangeMs > MAX_RANGE_MS) throw new BadRequestException('El rango máximo es de 92 días');
    await this.devices.findOne(deviceId);

    const bucketSeconds = bucketSecondsFor(rangeMs);
    let points: ReadingPoint[];

    if (bucketSeconds === 0) {
      const rows = await this.prisma.reading.findMany({
        where: { deviceId, createdAt: { gte: from, lt: to } },
        select: { createdAt: true, temperature: true, irrigation: true },
        orderBy: { createdAt: 'asc' },
      });
      points = rows.map((row) => {
        const temperature = toNumber(row.temperature);
        return {
          at: row.createdAt,
          temperature,
          min: temperature,
          max: temperature,
          irrigation: row.irrigation,
        };
      });
    } else {
      const rows = await this.prisma.$queryRaw<
        Array<{ bucket: Date; temperature: number; min: number; max: number; irrigation: boolean }>
      >`
        SELECT date_bin(make_interval(secs => ${bucketSeconds}::double precision), created_at, TIMESTAMPTZ '2000-01-01') AS bucket,
               round(avg(temperature), 2)::float8 AS temperature,
               min(temperature)::float8 AS min,
               max(temperature)::float8 AS max,
               bool_or(irrigation) AS irrigation
        FROM readings
        WHERE device_id = ${deviceId}::uuid AND created_at >= ${from} AND created_at < ${to}
        GROUP BY 1
        ORDER BY 1`;
      points = rows.map(({ bucket, ...row }) => ({ ...row, at: bucket }));
    }

    return { from, to, bucketSeconds, points };
  }

  async events(deviceId: string, params: { from?: string; before?: string; limit?: number }) {
    await this.devices.findOne(deviceId);
    const events = await this.prisma.event.findMany({
      where: {
        deviceId,
        createdAt: {
          gte: params.from ? new Date(params.from) : undefined,
          lt: params.before ? new Date(params.before) : undefined,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
    });
    return events.map((event) => ({
      id: event.id,
      type: event.type,
      temperature: toNumber(event.temperature),
      durationMin: toNumber(event.durationMin),
      createdAt: event.createdAt,
    }));
  }

  /** Today's figures (Guatemala calendar day). */
  async summary(deviceId: string) {
    const device = await this.devices.findOne(deviceId);
    const { tempMin, tempMax } = device.settings ?? DEFAULT_SETTINGS;
    const now = new Date();
    const since = startOfDayGt(now);
    const where = { deviceId, createdAt: { gte: since } };

    const [[totals], coldest, hottest, irrigation, lastOn] = await Promise.all([
      this.prisma.$queryRaw<Array<{ count: number; average: number | null; in_range: number }>>`
        SELECT count(*)::int AS count,
               round(avg(temperature), 2)::float8 AS average,
               count(*) FILTER (WHERE temperature BETWEEN ${tempMin} AND ${tempMax})::int AS in_range
        FROM readings
        WHERE device_id = ${deviceId}::uuid AND created_at >= ${since}`,
      this.prisma.reading.findFirst({
        where,
        orderBy: [{ temperature: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.reading.findFirst({
        where,
        orderBy: [{ temperature: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.event.aggregate({
        where: { ...where, type: 'irrigation_off' },
        _count: true,
        _sum: { durationMin: true },
      }),
      this.prisma.event.findFirst({
        where: { deviceId, type: 'irrigation_on' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      date: dateKeyGt(now),
      since,
      readingsCount: totals?.count ?? 0,
      average: totals?.average ?? null,
      optimalShare: totals && totals.count > 0 ? totals.in_range / totals.count : null,
      min: coldest ? { temperature: toNumber(coldest.temperature), at: coldest.createdAt } : null,
      max: hottest ? { temperature: toNumber(hottest.temperature), at: hottest.createdAt } : null,
      irrigationCycles: irrigation._count,
      irrigationMinutes: irrigation._sum.durationMin ? toNumber(irrigation._sum.durationMin) : 0,
      lastIrrigationOnAt: lastOn?.createdAt ?? null,
    };
  }
}
