import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.util.js';
import { DAY_MS, dateKeyGt, startOfDayGt } from '../src/common/time.util.js';
import { hashApiKey } from '../src/devices/api-key.util.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * "Análisis" endpoints over two days of known readings (every 5 minutes, Guatemala time):
 *   00:00–09:59 26 °C (fresco) · 10:00–13:59 31 °C (calor) · 14:00–14:59 33 °C (alerta) · 15:00–23:59 28 °C (óptimo)
 * On the second day irrigation turns on at 14:00 and the temperature falls 0.1 °C per minute for an hour.
 * Thresholds 27 / 30 / 32.
 */
describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `ana${Date.now().toString(36)}`;
  const PASSWORD = 'Correct-Horse-9';
  const roleKeys = [`e2e-viewer-${suffix}`, `e2e-none-${suffix}`];
  let deviceId: string;
  let token: string;
  let outsiderToken: string;

  const day1 = new Date(startOfDayGt(new Date()).getTime() - 2 * DAY_MS);
  const day2 = new Date(day1.getTime() + DAY_MS);
  const d1 = dateKeyGt(day1);
  const d2 = dateKeyGt(day2);
  const at = (day: Date, hour: number, minute = 0) =>
    new Date(day.getTime() + (hour * 60 + minute) * 60_000);

  function temperatureAt(minuteOfDay: number, secondDay: boolean): number {
    const hour = Math.floor(minuteOfDay / 60);
    if (secondDay && hour === 14) return 33 - 0.1 * (minuteOfDay - 14 * 60);
    if (hour < 10) return 26;
    if (hour < 14) return 31;
    if (hour === 14) return 33;
    return 28;
  }

  const http = () => request(app.getHttpServer());
  const get = (endpoint: string, query: Record<string, string>, auth = token) =>
    http()
      .get(`/api/analytics/${endpoint}`)
      .query(query)
      .set({ Authorization: `Bearer ${auth}` });
  const period = () => ({ deviceId, from: d1, to: d2 });

  async function login(name: string, roleKey: string, permissions: string[]) {
    const role = await prisma.role.create({
      data: { key: roleKey, name: `e2e-role-${suffix}-${name}`, permissions },
    });
    const email = `e2e-${name}-${suffix}@test.local`;
    await prisma.user.create({
      data: {
        email,
        name: `E2E ${name}`,
        roleId: role.id,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    const response = await http()
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return response.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const device = await prisma.device.create({
      data: {
        name: `e2e-analytics-${suffix}`,
        shed: 'E2E',
        apiKeyHash: hashApiKey(randomBytes(32).toString('hex')),
        createdAt: new Date(day1.getTime() - DAY_MS),
        settings: { create: { tempMin: 27, tempMax: 30, tempAlert: 32 } },
      },
    });
    deviceId = device.id;

    const readings = [day1, day2].flatMap((day, index) =>
      Array.from({ length: 288 }, (_, slot) => ({
        deviceId,
        temperature: temperatureAt(slot * 5, index === 1),
        irrigation: index === 1 && slot * 5 >= 14 * 60 && slot * 5 < 14 * 60 + 20,
        createdAt: at(day, 0, slot * 5),
      })),
    );
    await prisma.reading.createMany({ data: readings });
    await prisma.event.createMany({
      data: [
        { deviceId, type: 'irrigation_on', temperature: 33, createdAt: at(day2, 14) },
        {
          deviceId,
          type: 'irrigation_off',
          temperature: 31,
          durationMin: 20,
          createdAt: at(day2, 14, 20),
        },
      ],
    });

    token = await login('viewer', roleKeys[0], ['telemetry.read']);
    outsiderToken = await login('none', roleKeys[1], ['reports.export']);
  });

  afterAll(async () => {
    if (prisma) {
      // Guard: with an undefined id, delete could match every device.
      if (deviceId) await prisma.device.delete({ where: { id: deviceId } });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-', endsWith: `-${suffix}@test.local` } },
      });
      await prisma.role.deleteMany({ where: { key: { in: roleKeys } } });
    }
    await app?.close();
  });

  it('requires telemetry.read and valid filters', async () => {
    await get('summary', period(), outsiderToken).expect(403);
    await get('summary', { ...period(), from: '2026-13-01' }).expect(400);
    await get('summary', { ...period(), deviceId: 'not-a-uuid' }).expect(400);
    await get('summary', { ...period(), deviceId: '01a00000-0000-7000-8000-000000000000' }).expect(
      404,
    );
    await get('summary', { ...period(), from: '2026-01-01', to: '2026-06-01' }).expect(400);
  });

  it('summarizes the period against the previous one', async () => {
    const { body } = await get('summary', period()).expect(200);
    expect(body.period).toEqual({ from: d1, to: d2, days: 2 });
    expect(body.dataSince).toBeNull();
    expect(body.current).toMatchObject({
      readings: 576,
      max: 33,
      irrigationCycles: 1,
      irrigationMinutesPerDay: 10,
    });
    // The shed existed the day before, without readings.
    expect(body.previous).toMatchObject({ readings: 0, average: null });
    expect(body.hottest.temperature).toBe(33);
  });

  it('says when the shed started after the period began', async () => {
    const { body } = await get('summary', {
      ...period(),
      from: dateKeyGt(new Date(day1.getTime() - 5 * DAY_MS)),
    }).expect(200);
    expect(body.dataSince).toBe(dateKeyGt(new Date(day1.getTime() - DAY_MS)));
    expect(body.previous).toBeNull();
    expect(body.previousPeriod).toBeNull();
  });

  it('returns the averaged series with irrigation spans', async () => {
    const { body } = await get('series', period()).expect(200);
    expect(body.bucketSeconds).toBe(300);
    expect(body.points).toHaveLength(576);
    expect(body.points[0]).toMatchObject({ average: 26, min: 26, max: 26, irrigation: false });
    expect(body.irrigation).toEqual([
      { from: at(day2, 14).toISOString(), to: at(day2, 14, 20).toISOString() },
    ]);
  });

  it('builds the hour-by-day heat map', async () => {
    const { body } = await get('heatmap', period()).expect(200);
    expect(body.days).toEqual([d1, d2]);
    expect(body.cells).toHaveLength(48);
    expect(
      body.cells.find((c: { date: string; hour: number }) => c.date === d1 && c.hour === 14),
    ).toMatchObject({
      average: 33,
      count: 12,
    });
    expect(
      body.cells.find((c: { date: string; hour: number }) => c.date === d1 && c.hour === 3).average,
    ).toBe(26);
  });

  it('splits each day into thermal ranges', async () => {
    const { body } = await get('ranges', period()).expect(200);
    const [first] = body.days;
    expect(first).toEqual({
      date: d1,
      readings: 288,
      cold: Math.round((120 / 288) * 1e4) / 1e4,
      optimal: Math.round((108 / 288) * 1e4) / 1e4,
      warm: Math.round((48 / 288) * 1e4) / 1e4,
      alert: Math.round((12 / 288) * 1e4) / 1e4,
    });
  });

  it('measures how much irrigation cools the shed', async () => {
    const { body } = await get('irrigation', period()).expect(200);
    expect(body.cycles).toEqual([
      {
        at: at(day2, 14).toISOString(),
        durationMin: 20,
        // Average of 13:55 (31 °C) and 14:00 (33 °C).
        startTemperature: 32,
        // 14:15 → 33 − 1.5.
        after15Temperature: 31.5,
        drop: 0.5,
        // First reading at or below 30 °C: 14:30.
        recoveryMin: 30,
        startedHot: true,
      },
    ]);
    expect(body.summary).toMatchObject({
      cycles: 1,
      measured: 1,
      averageDrop: 0.5,
      effectiveShare: 1,
      averageRecoveryMin: 30,
    });
    const atMinute = (minute: number) =>
      body.curve.find((p: { minute: number }) => p.minute === minute);
    expect(atMinute(0).delta).toBe(1); // 33 − 32
    expect(atMinute(15).delta).toBe(-0.5); // 31.5 − 32
    expect(atMinute(-10).delta).toBe(-1); // 31 − 32
  });

  it('compares the last day with the day before and the weekly average', async () => {
    const { body } = await get('compare', period()).expect(200);
    expect(body).toMatchObject({ slotMinutes: 15, day: d2, previousDay: d1 });
    const slot14 = (14 * 60) / 15;
    // 14:00, 14:05 and 14:10 on the second day.
    expect(body.curves.day[slot14]).toBe(32.5);
    expect(body.curves.previousDay[slot14]).toBe(33);
    expect(body.curves.weekAverage[slot14]).toBe(33);
    expect(body.curves.day).toHaveLength(96);
  });
});
