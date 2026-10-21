import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AlertEngineService } from '../src/alerts/alert-engine.service.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.util.js';
import { hashApiKey } from '../src/devices/api-key.util.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * Alerts and inbox, end to end: ESP32 events → alert → notifications →
 * "Lo atiendo" → resolution, plus the per-minute engine with a fixed clock.
 * Everything hangs off a throwaway device and is removed at the end.
 */
describe('Alerts and notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let engine: AlertEngineService;
  const suffix = `alr${Date.now().toString(36)}`;
  const PASSWORD = 'Correct-Horse-9';
  const apiKey = randomBytes(32).toString('hex');
  let deviceId: string;
  let watcher: { id: string; token: string };
  let manager: { id: string; token: string };
  const roleKeys = [`e2e-watch-${suffix}`, `e2e-manage-${suffix}`];

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const esp32Event = (body: object) =>
    http().post('/api/events').set('x-api-key', apiKey).send(body).expect(201);

  /** The engine reacts to live telemetry asynchronously. */
  async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
    for (let i = 0; i < 250; i++) {
      const value = await read();
      if (done(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error('Condition not met in time');
  }

  const alertsOf = (kind?: string) =>
    prisma.alert.findMany({
      where: { deviceId, kind: kind as never },
      orderBy: { openedAt: 'asc' },
    });

  async function userWith(name: string, roleKey: string, permissions: string[]) {
    const role = await prisma.role.create({
      data: { key: roleKey, name: `e2e-role-${suffix}-${name}`, permissions },
    });
    const email = `e2e-${name}-${suffix}@test.local`;
    const user = await prisma.user.create({
      data: {
        email,
        name: `E2E ${name}`,
        roleId: role.id,
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    const login = await http()
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { id: user.id, token: login.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    engine = app.get(AlertEngineService);

    const device = await prisma.device.create({
      data: {
        name: `e2e-alerts-${suffix}`,
        shed: 'E2E',
        apiKeyHash: hashApiKey(apiKey),
        settings: { create: {} },
      },
    });
    deviceId = device.id;
    watcher = await userWith('watcher', roleKeys[0], ['telemetry.read']);
    manager = await userWith('manager', roleKeys[1], ['telemetry.read', 'alerts.manage']);
  });

  afterAll(async () => {
    if (prisma) {
      // Guard: with an undefined id, delete/deleteMany could match every device.
      if (deviceId) await prisma.device.delete({ where: { id: deviceId } });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-', endsWith: `-${suffix}@test.local` } },
      });
      await prisma.role.deleteMany({ where: { key: { in: roleKeys } } });
    }
    await app?.close();
  });

  it('opens one alert per incident and notifies everyone who watches the sheds', async () => {
    await esp32Event({ type: 'heat_alert_no_irrigation', temperature: 32.6 });
    const [alert] = await eventually(
      () => alertsOf('heat_no_irrigation'),
      (a) => a.length === 1,
    );
    expect(alert).toMatchObject({ severity: 'critical', status: 'open' });

    // The ESP32 repeating the event does not create a second alert, but raises the peak.
    await esp32Event({ type: 'heat_alert_no_irrigation', temperature: 33.1 });
    await eventually(
      () => alertsOf('heat_no_irrigation'),
      (a) => a.length === 1 && a[0].peakTemperature?.toNumber() === 33.1,
    );

    const inbox = await http().get('/api/notifications').set(bearer(watcher.token)).expect(200);
    const opened = inbox.body.filter((n: { alertId: string }) => n.alertId === alert.id);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ kind: 'alert_opened', severity: 'critical', readAt: null });
    expect(opened[0].title).toBe(`Calor sin riego · e2e-alerts-${suffix}`);
    expect(opened[0].body).toContain('32.60 °C');

    const active = await http()
      .get('/api/alerts')
      .query({ status: 'active', deviceId })
      .set(bearer(watcher.token))
      .expect(200);
    expect(active.body).toHaveLength(1);
    expect(active.body[0]).toMatchObject({ label: 'Calor sin riego', peakTemperature: 33.1 });
  });

  it('"Lo atiendo" records who took it; turning irrigation on resolves it', async () => {
    const [alert] = await alertsOf('heat_no_irrigation');
    const acked = await http()
      .post(`/api/alerts/${alert.id}/acknowledge`)
      .set(bearer(watcher.token))
      .expect(200);
    expect(acked.body).toMatchObject({
      status: 'acknowledged',
      acknowledgedBy: { id: watcher.id, name: 'E2E watcher' },
    });

    await esp32Event({ type: 'irrigation_on', temperature: 32.9 });
    const [resolved] = await eventually(
      () => alertsOf('heat_no_irrigation'),
      (a) => a[0].status === 'resolved',
    );
    expect(resolved.resolution).toBe('Se encendió el riego');

    const notice = await eventually(
      () =>
        prisma.notification.findFirst({
          where: { userId: manager.id, alertId: alert.id, kind: 'alert_resolved' },
        }),
      (n) => n !== null,
    );
    expect(notice!.body).toContain('Atendió E2E watcher');
    expect(notice!.body).toContain('Máxima 33.10 °C');

    // A resolved alert can no longer be acknowledged.
    await http().post(`/api/alerts/${alert.id}/acknowledge`).set(bearer(watcher.token)).expect(409);
  });

  it('detects an offline shed every minute and closes the alert when data returns', async () => {
    const now = new Date();
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(now.getTime() - 6 * 60_000) },
    });
    await engine.tick(now, [deviceId]);
    const [offline] = await alertsOf('device_offline');
    expect(offline).toMatchObject({ status: 'open', severity: 'critical' });

    // A second pass does not duplicate it.
    await engine.tick(new Date(now.getTime() + 60_000), [deviceId]);
    expect(await alertsOf('device_offline')).toHaveLength(1);

    await http()
      .post('/api/readings')
      .set('x-api-key', apiKey)
      .send({ temperature: 28.4, irrigation: false })
      .expect(201);
    const [back] = await eventually(
      () => alertsOf('device_offline'),
      (a) => a[0].status === 'resolved',
    );
    expect(back.resolution).toBe('Volvió a enviar datos');
  });

  it('escalates unattended critical alerts only to people who manage alerts', async () => {
    await esp32Event({ type: 'sensor_error', temperature: null });
    const [alert] = await eventually(
      () => alertsOf('sensor_error'),
      (a) => a.length === 1,
    );

    // 16 minutes later nobody has attended it.
    await engine.tick(new Date(alert.openedAt.getTime() + 16 * 60_000), [deviceId]);
    const escalated = await prisma.notification.findMany({
      where: { alertId: alert.id, kind: 'alert_escalated' },
    });
    expect(escalated.map((n) => n.userId)).toContain(manager.id);
    expect(escalated.map((n) => n.userId)).not.toContain(watcher.id);
    expect(
      (await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).escalatedAt,
    ).not.toBeNull();

    // 31 minutes later: reminder for everyone.
    await engine.tick(new Date(alert.openedAt.getTime() + 31 * 60_000), [deviceId]);
    const reminder = await prisma.notification.findFirst({
      where: { alertId: alert.id, kind: 'alert_reminder', userId: watcher.id },
    });
    expect(reminder?.title).toBe(`Sigue sin atenderse: Error del sensor · e2e-alerts-${suffix}`);
  });

  it('only people who manage alerts can close them by hand', async () => {
    const [alert] = await alertsOf('sensor_error');
    await http().post(`/api/alerts/${alert.id}/resolve`).set(bearer(watcher.token)).expect(403);
    const closed = await http()
      .post(`/api/alerts/${alert.id}/resolve`)
      .set(bearer(manager.token))
      .expect(200);
    expect(closed.body).toMatchObject({
      status: 'resolved',
      resolution: 'Cerrada manualmente por E2E manager',
    });
    await http().post(`/api/alerts/${alert.id}/resolve`).set(bearer(manager.token)).expect(409);
  });

  it('manages the inbox: unread count, mark one, mark all, and keeps inboxes private', async () => {
    const before = await http()
      .get('/api/notifications/unread-count')
      .set(bearer(watcher.token))
      .expect(200);
    expect(before.body.count).toBeGreaterThan(0);

    const [first] = (
      await http().get('/api/notifications?unread=true&limit=1').set(bearer(watcher.token))
    ).body;
    await http().post(`/api/notifications/${first.id}/read`).set(bearer(watcher.token)).expect(204);
    // Someone else's notification is invisible.
    await http().post(`/api/notifications/${first.id}/read`).set(bearer(manager.token)).expect(404);

    const after = await http().get('/api/notifications/unread-count').set(bearer(watcher.token));
    expect(after.body.count).toBe(before.body.count - 1);

    await http().post('/api/notifications/read-all').set(bearer(watcher.token)).expect(200);
    const none = await http().get('/api/notifications/unread-count').set(bearer(watcher.token));
    expect(none.body.count).toBe(0);
  });

  it('filters the history and summarizes response times', async () => {
    const resolvedHeat = await http()
      .get('/api/alerts')
      .query({ deviceId, status: 'resolved', kind: 'heat_no_irrigation' })
      .set(bearer(watcher.token))
      .expect(200);
    expect(resolvedHeat.body).toHaveLength(1);
    expect(resolvedHeat.body[0].acknowledgedBy).toMatchObject({ id: watcher.id });

    const warnings = await http()
      .get('/api/alerts')
      .query({ deviceId, severity: 'warning' })
      .set(bearer(watcher.token))
      .expect(200);
    expect(warnings.body).toHaveLength(0);

    await http().get('/api/alerts').query({ kind: 'nope' }).set(bearer(watcher.token)).expect(400);

    const stats = await http()
      .get('/api/alerts/stats')
      .query({ deviceId, days: 7 })
      .set(bearer(watcher.token))
      .expect(200);
    // Whatever the earlier tests left on this device, the counts must match the table.
    const all = await alertsOf();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(stats.body).toMatchObject({
      days: 7,
      total: all.length,
      critical: all.filter((a) => a.severity === 'critical').length,
      unresolved: all.filter((a) => a.status !== 'resolved').length,
      escalated: all.filter((a) => a.escalatedAt !== null).length,
      acknowledged: 1,
    });
    expect(stats.body.avgResponseMin).toEqual(expect.any(Number));
    expect(stats.body.avgDurationMin).toEqual(expect.any(Number));
    expect(stats.body.byKind.map((k: { label: string }) => k.label)).toEqual(
      expect.arrayContaining(['Calor sin riego', 'Error del sensor']),
    );
  });

  it('lets alert managers tune the timings of a shed', async () => {
    await http()
      .patch(`/api/devices/${deviceId}/alert-rules`)
      .set(bearer(watcher.token))
      .send({ offlineAfterMin: 10 })
      .expect(403);
    const updated = await http()
      .patch(`/api/devices/${deviceId}/alert-rules`)
      .set(bearer(manager.token))
      .send({ offlineAfterMin: 10, escalateAfterMin: 20 })
      .expect(200);
    expect(updated.body.alertRules).toMatchObject({ offlineAfterMin: 10, escalateAfterMin: 20 });
    await http()
      .patch(`/api/devices/${deviceId}/alert-rules`)
      .set(bearer(manager.token))
      .send({ offlineAfterMin: 0 })
      .expect(400);
  });

  /** Readings every 30 s from `fromMin` to `toMin` minutes before `now`. */
  async function readingsBetween(
    now: Date,
    fromMin: number,
    toMin: number,
    reading: { temperature: number; irrigation: boolean },
  ) {
    const data = [];
    for (let m = fromMin; m >= toMin; m -= 0.5) {
      data.push({ deviceId, ...reading, createdAt: new Date(now.getTime() - m * 60_000) });
    }
    await prisma.reading.createMany({ data });
  }

  it('detects heat without irrigation from readings and closes it when irrigation starts', async () => {
    const now = new Date(Date.now() + 30 * 60_000);
    // 5.5 minutes at 33 °C with irrigation off (alert temperature is 32 °C, rule is 5 min).
    await readingsBetween(now, 5.5, 0.5, { temperature: 33, irrigation: false });
    await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: now } });
    await engine.tick(now, [deviceId]);

    const [alert] = await alertsOf('heat_no_irrigation').then((a) =>
      a.filter((x) => x.status !== 'resolved'),
    );
    expect(alert).toMatchObject({ status: 'open', severity: 'critical' });
    expect(Number(alert.triggerTemperature)).toBe(33);

    await http()
      .post('/api/readings')
      .set('x-api-key', apiKey)
      .send({ temperature: 32.6, irrigation: true })
      .expect(201);
    const closed = await eventually(
      () => prisma.alert.findUniqueOrThrow({ where: { id: alert.id } }),
      (a) => a.status === 'resolved',
    );
    expect(closed.resolution).toBe('Se encendió el riego');
  });

  it('detects prolonged irrigation from readings and closes it when irrigation stops', async () => {
    const now = new Date(Date.now() + 90 * 60_000);
    await readingsBetween(now, 31, 0.5, { temperature: 28, irrigation: true });
    await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: now } });
    await engine.tick(now, [deviceId]);

    const [alert] = await alertsOf('prolonged_irrigation');
    expect(alert).toMatchObject({ status: 'open', severity: 'warning' });
    expect(alert.metadata).toEqual({ durationMin: 30 });

    await http()
      .post('/api/readings')
      .set('x-api-key', apiKey)
      .send({ temperature: 28, irrigation: false })
      .expect(201);
    const closed = await eventually(
      () => prisma.alert.findUniqueOrThrow({ where: { id: alert.id } }),
      (a) => a.status === 'resolved',
    );
    expect(closed.resolution).toBe('Se apagó el riego');
  });

  it('skips irrigation rules for sheds without an irrigation detector', async () => {
    const res = await http()
      .patch(`/api/devices/${deviceId}/alert-rules`)
      .set(bearer(manager.token))
      .send({ irrigationSensor: false, heatNoIrrigationMin: 4 })
      .expect(200);
    expect(res.body.alertRules).toMatchObject({
      irrigationSensor: false,
      heatNoIrrigationMin: 4,
      prolongedIrrigationMin: 30,
    });

    const now = new Date(Date.now() + 150 * 60_000);
    await readingsBetween(now, 5, 0.5, { temperature: 33, irrigation: false });
    await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: now } });
    await engine.tick(now, [deviceId]);
    const open = (await alertsOf('heat_no_irrigation')).filter((a) => a.status !== 'resolved');
    expect(open).toHaveLength(0);

    await http()
      .patch(`/api/devices/${deviceId}/alert-rules`)
      .set(bearer(manager.token))
      .send({ irrigationSensor: true, heatNoIrrigationMin: 5 })
      .expect(200);
  });
});
