import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.util.js';
import { SYSTEM_ROLES } from '../src/auth/permissions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ReportDataService } from '../src/reports/report-data.service.js';

/** Collects a binary response body into a Buffer. */
function binary(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

/**
 * Reports: permissions, validation, file output and the figures behind them.
 * Records use the "e2e-" prefix and are removed at the end.
 */
describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `rpt${Date.now().toString(36)}`;
  const PASSWORD = 'Correct-Horse-9';
  const DAY = '2026-10-10';
  let deviceId: string;
  let reporterToken: string;
  let viewerToken: string;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  /** Guatemala wall-clock time on DAY (UTC-6). */
  const local = (time: string) => new Date(`${DAY}T${time}:00-06:00`);

  async function userWithRole(name: string, roleId: string) {
    const email = `e2e-${name}-${suffix}@test.local`;
    await prisma.user.create({
      data: { email, name: `E2E ${name}`, roleId, passwordHash: await hashPassword(PASSWORD) },
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

    for (const role of SYSTEM_ROLES) {
      await prisma.role.upsert({
        where: { key: role.key },
        update: {},
        create: { ...role, isSystem: true },
      });
    }
    const reporterRole = await prisma.role.create({
      data: {
        key: `e2e-reporter-${suffix}`,
        name: `e2e-role-${suffix}-reporter`,
        permissions: ['reports.export'],
      },
    });
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { key: 'viewer' } });
    reporterToken = await userWithRole('reporter', reporterRole.id);
    viewerToken = await userWithRole('viewer', viewerRole.id);

    const device = await prisma.device.create({
      data: {
        name: `e2e-shed-${suffix}`,
        shed: 'E2E',
        apiKeyHash: `e2e${suffix}`.padEnd(64, '0'),
        // Registered before DAY so the whole day counts toward coverage.
        createdAt: new Date('2026-10-01T00:00:00Z'),
        settings: { create: { tempMin: 27, tempMax: 30, tempAlert: 32 } },
      },
    });
    deviceId = device.id;

    await prisma.reading.createMany({
      data: [
        { deviceId, temperature: 25, irrigation: false, createdAt: local('06:00') },
        { deviceId, temperature: 28, irrigation: false, createdAt: local('09:00') },
        { deviceId, temperature: 29, irrigation: true, createdAt: local('12:00') },
        { deviceId, temperature: 33, irrigation: false, createdAt: local('15:00') },
        // 23:30 local is already the next day in UTC: it must still count for DAY.
        { deviceId, temperature: 28, irrigation: false, createdAt: local('23:30') },
      ],
    });
    await prisma.event.createMany({
      data: [
        { deviceId, type: 'irrigation_on', temperature: 29, createdAt: local('11:50') },
        {
          deviceId,
          type: 'irrigation_off',
          temperature: 28,
          durationMin: 10,
          createdAt: local('12:00'),
        },
        {
          deviceId,
          type: 'irrigation_off',
          temperature: 28,
          durationMin: 5,
          createdAt: local('13:00'),
        },
        { deviceId, type: 'heat_alert_no_irrigation', temperature: 33, createdAt: local('15:00') },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      // Guard: with an undefined id, deleteMany would match every device.
      if (deviceId) await prisma.device.delete({ where: { id: deviceId } });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-', endsWith: `-${suffix}@test.local` } },
      });
      await prisma.role.deleteMany({ where: { key: `e2e-reporter-${suffix}` } });
    }
    await app?.close();
  });

  const url = (query: Record<string, string>) =>
    `/api/reports/operations?${new URLSearchParams(query)}`;

  it('requires the reports.export permission', async () => {
    await http()
      .get(url({ format: 'pdf', from: DAY, to: DAY }))
      .expect(401);
    await http()
      .get(url({ format: 'pdf', from: DAY, to: DAY }))
      .set(bearer(viewerToken))
      .expect(403);
  });

  it('returns a PDF with a descriptive file name', async () => {
    const response = await http()
      .get(url({ format: 'pdf', from: DAY, to: DAY, deviceId }))
      .set(bearer(reporterToken))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="reporte-e2e-shed-${suffix}_${DAY}.pdf"`,
    );
    expect(response.headers['x-report-code']).toMatch(/^LS-\d{8}-\d{4}-[0-9A-F]{3}$/);
    expect((response.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('returns an Excel workbook and records the export in the audit log', async () => {
    const response = await http()
      .get(url({ format: 'xlsx', from: '2026-10-09', to: '2026-10-11', deviceId }))
      .set(bearer(reporterToken))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    // XLSX files are ZIP archives.
    expect((response.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'report.exported', entityId: deviceId },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.metadata).toMatchObject({ format: 'xlsx', from: '2026-10-09', to: '2026-10-11' });

    const recent = await http().get('/api/reports/recent').set(bearer(reporterToken)).expect(200);
    expect(recent.body[0]).toMatchObject({
      format: 'xlsx',
      from: '2026-10-09',
      to: '2026-10-11',
      deviceId,
      deviceName: `e2e-shed-${suffix}`,
    });
  });

  it.each([
    [{ format: 'csv', from: DAY, to: DAY }, 'unknown format'],
    [{ format: 'pdf', from: '2026-02-30', to: '2026-03-01' }, 'date that does not exist'],
    [{ format: 'pdf', from: '2026-10-10', to: '2026-10-01' }, 'end before start'],
    [{ format: 'pdf', from: '2026-01-01', to: '2026-06-30' }, 'more than 92 days'],
    [{ format: 'pdf', from: '10/10/2026', to: DAY }, 'wrong date format'],
  ])('rejects %j (%s)', async (query) => {
    await http().get(url(query)).set(bearer(reporterToken)).expect(400);
  });

  it('returns 404 for an unknown shed', async () => {
    await http()
      .get(
        url({
          format: 'pdf',
          from: DAY,
          to: DAY,
          deviceId: '01a00000-0000-7000-8000-000000000000',
        }),
      )
      .set(bearer(reporterToken))
      .expect(404);
  });

  it('computes the figures on Guatemala calendar days', async () => {
    const report = await app.get(ReportDataService).build({
      fromDate: '2026-10-09',
      toDate: '2026-10-11',
      deviceId,
      requester: { name: 'E2E', email: 'e2e@test.local' },
    });
    const [device] = report.devices;

    expect(report.period.days).toBe(3);
    expect(device.daily.map((d) => d.date)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    const day = device.daily[1];
    expect(day.readings).toBe(5);
    expect(day.average).toBe(28.6);
    expect(day.min).toBe(25);
    expect(day.max).toBe(33);
    expect(day.optimalShare).toBeCloseTo(3 / 5);
    expect(day.belowShare).toBeCloseTo(1 / 5);
    expect(day.aboveShare).toBeCloseTo(1 / 5);
    expect(day.alertShare).toBeCloseTo(1 / 5);
    expect(day.irrigationCycles).toBe(2);
    expect(day.irrigationMinutes).toBe(15);
    expect(day.heatAlerts).toBe(1);
    expect(day.coverage).toBeCloseTo(5 / 288);
    expect(device.daily[2].readings).toBe(0);
    expect(device.daily[2].average).toBeNull();

    expect(device.totals.readings).toBe(5);
    expect(device.hottest).toMatchObject({ temperature: 33, at: local('15:00') });
    expect(device.coldest).toMatchObject({ temperature: 25, at: local('06:00') });
    expect(device.events).toHaveLength(4);
  });
});
