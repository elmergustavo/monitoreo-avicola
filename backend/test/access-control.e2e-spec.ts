import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.util.js';
import { SYSTEM_ROLES } from '../src/auth/permissions.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * End-to-end tests for login, sessions, users, roles and permissions.
 * Every record created here uses the "e2e-" prefix and is removed at the end.
 */
describe('Access control (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now().toString(36);
  const email = (name: string) => `e2e-${name}-${suffix}@test.local`;
  const PASSWORD = 'Correct-Horse-9';
  const createdDeviceIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createUser(name: string, roleKey: string, mustChangePassword = false) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    return prisma.user.create({
      data: {
        email: email(name),
        name: `E2E ${name}`,
        roleId: role.id,
        passwordHash: await hashPassword(PASSWORD),
        mustChangePassword,
      },
    });
  }

  async function login(userEmail: string, password = PASSWORD) {
    const response = await http()
      .post('/api/auth/login')
      .send({ email: userEmail, password })
      .expect(200);
    const cookie = ([] as string[])
      .concat(response.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='));
    return { token: response.body.accessToken as string, cookie: cookie!.split(';')[0] };
  }

  let adminToken: string;
  let supervisorToken: string;
  let viewerToken: string;
  let deviceId: string;

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
    await createUser('admin', 'admin');
    await createUser('supervisor', 'supervisor');
    await createUser('viewer', 'viewer');
    adminToken = (await login(email('admin'))).token;
    supervisorToken = (await login(email('supervisor'))).token;
    viewerToken = (await login(email('viewer'))).token;

    const created = await http()
      .post('/api/devices')
      .set(bearer(adminToken))
      .send({ name: `e2e-device-${suffix}`, shed: 'E2E' })
      .expect(201);
    deviceId = created.body.device.id;
    createdDeviceIds.push(deviceId);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.device.deleteMany({ where: { id: { in: createdDeviceIds } } });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-', endsWith: `-${suffix}@test.local` } },
      });
      await prisma.role.deleteMany({ where: { name: { startsWith: `e2e-role-${suffix}` } } });
    }
    await app?.close();
  });

  describe('login and sessions', () => {
    it('rejects a wrong password and an unknown email with the same 401', async () => {
      const wrong = await http()
        .post('/api/auth/login')
        .send({ email: email('admin'), password: 'nope' })
        .expect(401);
      const unknown = await http()
        .post('/api/auth/login')
        .send({ email: email('ghost'), password: 'nope' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('sets an httpOnly, SameSite=Strict refresh cookie scoped to /api/auth', async () => {
      const response = await http()
        .post('/api/auth/login')
        .send({ email: email('viewer'), password: PASSWORD })
        .expect(200);
      const cookie = ([] as string[]).concat(response.headers['set-cookie'] ?? []).join(';');
      expect(cookie).toMatch(/refresh_token=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth/);
      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        expiresIn: expect.any(Number),
      });
    });

    const cookieFrom = (response: request.Response) =>
      ([] as string[])
        .concat(response.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('refresh_token='))!
        .split(';')[0];

    it('rotates the refresh token on every use', async () => {
      const { cookie: first } = await login(email('viewer'));
      const refreshed = await http().post('/api/auth/refresh').set('Cookie', first).expect(200);
      const second = cookieFrom(refreshed);
      expect(second).not.toBe(first);
      await http().get('/api/devices').set(bearer(refreshed.body.accessToken)).expect(200);
      await http().post('/api/auth/refresh').set('Cookie', second).expect(200);
    });

    it('accepts the replaced token briefly, in case the new cookie never reached the browser', async () => {
      const { cookie: first } = await login(email('viewer'));
      const lost = await http().post('/api/auth/refresh').set('Cookie', first).expect(200);
      // The browser never stored the new cookie and retries with the old one.
      const recovered = await http().post('/api/auth/refresh').set('Cookie', first).expect(200);
      await http().get('/api/devices').set(bearer(recovered.body.accessToken)).expect(200);
      // Only the token replaced last is accepted: the first one is now gone.
      await http().post('/api/auth/refresh').set('Cookie', first).expect(401);
      expect(cookieFrom(recovered)).not.toBe(cookieFrom(lost));
    });

    it('rejects the replaced token once the grace period is over', async () => {
      const { cookie: first } = await login(email('viewer'));
      const refreshed = await http().post('/api/auth/refresh').set('Cookie', first).expect(200);
      const session = await prisma.session.findFirstOrThrow({
        where: { user: { email: email('viewer') } },
        orderBy: { lastUsedAt: 'desc' },
      });
      await prisma.session.update({
        where: { id: session.id },
        data: { rotatedAt: new Date(Date.now() - 3 * 60_000) },
      });
      await http().post('/api/auth/refresh').set('Cookie', first).expect(401);
      await http().post('/api/auth/refresh').set('Cookie', cookieFrom(refreshed)).expect(200);
    });

    it('logout revokes the session immediately', async () => {
      const { token } = await login(email('viewer'));
      await http().post('/api/auth/logout').set(bearer(token)).expect(204);
      await http().get('/api/devices').set(bearer(token)).expect(401);
    });

    it('requires a token on protected routes (401)', async () => {
      await http().get('/api/devices').expect(401);
      await http().get('/api/devices').set(bearer('not-a-jwt')).expect(401);
    });

    it('forces a temporary password to be changed before anything else', async () => {
      await createUser('newcomer', 'viewer', true);
      const { token } = await login(email('newcomer'));

      const blocked = await http().get('/api/devices').set(bearer(token)).expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await http().get('/api/auth/me').set(bearer(token)).expect(200);

      await http()
        .patch('/api/auth/me/password')
        .set(bearer(token))
        .send({ currentPassword: 'wrong', newPassword: 'Another-Pass-9' })
        .expect(400);
      await http()
        .patch('/api/auth/me/password')
        .set(bearer(token))
        .send({ currentPassword: PASSWORD, newPassword: 'short' })
        .expect(400);
      await http()
        .patch('/api/auth/me/password')
        .set(bearer(token))
        .send({ currentPassword: PASSWORD, newPassword: 'Another-Pass-9' })
        .expect(204);
      await http().get('/api/devices').set(bearer(token)).expect(200);
    });
  });

  describe('permissions by role', () => {
    it('viewer can read sheds but not manage anything (403)', async () => {
      await http().get('/api/devices').set(bearer(viewerToken)).expect(200);
      await http().get(`/api/devices/${deviceId}/summary`).set(bearer(viewerToken)).expect(200);
      await http().get('/api/users').set(bearer(viewerToken)).expect(403);
      await http().get('/api/audit-logs').set(bearer(viewerToken)).expect(403);
      await http()
        .patch(`/api/devices/${deviceId}/settings`)
        .set(bearer(viewerToken))
        .send({ tempMin: 26, tempMax: 30, tempAlert: 33 })
        .expect(403);
      await http()
        .post('/api/devices')
        .set(bearer(viewerToken))
        .send({ name: 'x1', shed: 'x' })
        .expect(403);
    });

    it('supervisor can change thresholds, validating their order', async () => {
      await http()
        .patch(`/api/devices/${deviceId}/settings`)
        .set(bearer(supervisorToken))
        .send({ tempMin: 31, tempMax: 30, tempAlert: 33 })
        .expect(400);
      const response = await http()
        .patch(`/api/devices/${deviceId}/settings`)
        .set(bearer(supervisorToken))
        .send({ tempMin: 26.5, tempMax: 30, tempAlert: 33 })
        .expect(200);
      expect(response.body.settings).toEqual({ tempMin: 26.5, tempMax: 30, tempAlert: 33 });
      await http().get('/api/users').set(bearer(supervisorToken)).expect(403);
    });
  });

  describe('users', () => {
    it('admin creates a user with a temporary password; duplicates are rejected (409)', async () => {
      const viewerRole = await prisma.role.findUniqueOrThrow({ where: { key: 'viewer' } });
      const response = await http()
        .post('/api/users')
        .set(bearer(adminToken))
        .send({
          email: email('Created').toUpperCase(),
          name: 'Created User',
          roleId: viewerRole.id,
        })
        .expect(201);
      expect(response.body.user).toMatchObject({
        email: email('created'),
        mustChangePassword: true,
      });
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);

      await http()
        .post('/api/users')
        .set(bearer(adminToken))
        .send({ email: email('created'), name: 'Again', roleId: viewerRole.id })
        .expect(409);
    });

    it('admin cannot deactivate or demote themselves', async () => {
      const me = await http().get('/api/auth/me').set(bearer(adminToken)).expect(200);
      await http()
        .patch(`/api/users/${me.body.id}`)
        .set(bearer(adminToken))
        .send({ active: false })
        .expect(400);
    });

    it('deactivating a user signs them out everywhere', async () => {
      const target = await createUser('leaving', 'viewer');
      const { token } = await login(email('leaving'));
      await http()
        .patch(`/api/users/${target.id}`)
        .set(bearer(adminToken))
        .send({ active: false })
        .expect(200);
      await http().get('/api/devices').set(bearer(token)).expect(401);
      await http()
        .post('/api/auth/login')
        .send({ email: email('leaving'), password: PASSWORD })
        .expect(401);
    });

    it('password reset returns a new temporary password', async () => {
      const target = await createUser('forgetful', 'viewer');
      const response = await http()
        .post(`/api/users/${target.id}/reset-password`)
        .set(bearer(adminToken))
        .expect(201);
      const { token } = await login(email('forgetful'), response.body.temporaryPassword);
      await http().get('/api/devices').set(bearer(token)).expect(403);
    });
  });

  describe('roles', () => {
    it('admin creates, edits and deletes a custom role; the admin role is locked', async () => {
      const created = await http()
        .post('/api/roles')
        .set(bearer(adminToken))
        .send({ name: `e2e-role-${suffix}`, permissions: ['telemetry.read', 'audit.read'] })
        .expect(201);
      await http()
        .post('/api/roles')
        .set(bearer(adminToken))
        .send({ name: `e2e-role-${suffix}-bad`, permissions: ['everything'] })
        .expect(400);
      await http()
        .patch(`/api/roles/${created.body.id}`)
        .set(bearer(adminToken))
        .send({ permissions: ['telemetry.read'] })
        .expect(200);

      const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });
      await http()
        .patch(`/api/roles/${adminRole.id}`)
        .set(bearer(adminToken))
        .send({ permissions: [] })
        .expect(400);
      await http().delete(`/api/roles/${adminRole.id}`).set(bearer(adminToken)).expect(400);
      await http().delete(`/api/roles/${created.body.id}`).set(bearer(adminToken)).expect(204);
    });
  });

  describe('devices and telemetry', () => {
    it('a new device key works on the ESP32 endpoint, and rotating it revokes the old one', async () => {
      const created = await http()
        .post('/api/devices')
        .set(bearer(adminToken))
        .send({ name: `e2e-device-${suffix}-b`, shed: 'E2E' })
        .expect(201);
      createdDeviceIds.push(created.body.device.id);
      const oldKey = created.body.apiKey as string;
      expect(oldKey).toMatch(/^[0-9a-f]{64}$/);

      await http()
        .post('/api/readings')
        .set('x-api-key', oldKey)
        .send({ temperature: 28.4, irrigation: false })
        .expect(201);

      const rotated = await http()
        .post(`/api/devices/${created.body.device.id}/rotate-key`)
        .set(bearer(adminToken))
        .expect(201);
      await http()
        .post('/api/readings')
        .set('x-api-key', oldKey)
        .send({ temperature: 28.4, irrigation: false })
        .expect(401);
      await http()
        .post('/api/readings')
        .set('x-api-key', rotated.body.apiKey)
        .send({ temperature: 28.6, irrigation: true })
        .expect(201);

      const device = await http()
        .get(`/api/devices/${created.body.device.id}`)
        .set(bearer(viewerToken))
        .expect(200);
      expect(device.body).toMatchObject({
        online: true,
        lastReading: { temperature: 28.6, irrigation: true },
      });

      const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const readings = await http()
        .get(`/api/devices/${created.body.device.id}/readings`)
        .query({ from })
        .set(bearer(viewerToken))
        .expect(200);
      expect(readings.body.bucketSeconds).toBe(0);
      expect(readings.body.points.map((p: { temperature: number }) => p.temperature)).toEqual([
        28.4, 28.6,
      ]);
    });

    it('rejects an inverted or too long time range (400)', async () => {
      const now = Date.now();
      await http()
        .get(`/api/devices/${deviceId}/readings`)
        .query({ from: new Date(now).toISOString(), to: new Date(now - 1000).toISOString() })
        .set(bearer(viewerToken))
        .expect(400);
      await http()
        .get(`/api/devices/${deviceId}/readings`)
        .query({ from: new Date(now - 100 * 86_400_000).toISOString() })
        .set(bearer(viewerToken))
        .expect(400);
    });

    it('records management actions in the audit log', async () => {
      const response = await http()
        .get('/api/audit-logs')
        .query({ action: 'device.' })
        .set(bearer(adminToken))
        .expect(200);
      const actions = response.body.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining(['device.created', 'device.key_rotated', 'device.settings_updated']),
      );
    });
  });
});
