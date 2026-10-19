import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashApiKey } from '../src/devices/api-key.util.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * End-to-end tests for the endpoints used by the ESP32. They run against the
 * database in DATABASE_URL using a throwaway device that is removed at the end
 * (readings and events are deleted in cascade).
 */
describe('ESP32 endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deviceId: string;
  const apiKey = randomBytes(32).toString('hex');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const device = await prisma.device.create({
      data: {
        name: 'E2E test device',
        shed: 'E2E',
        apiKeyHash: hashApiKey(apiKey),
        settings: { create: {} },
      },
    });
    deviceId = device.id;
  });

  afterAll(async () => {
    // Guard: with an undefined id, deleteMany would match every device.
    if (deviceId) await prisma?.device.delete({ where: { id: deviceId } });
    await app?.close();
  });

  describe('POST /api/readings', () => {
    const validReading = { temperature: 29.5, irrigation: false };

    it('stores the reading with a valid API key (201)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/readings')
        .set('x-api-key', apiKey)
        .send(validReading)
        .expect(201);

      expect(response.body).toMatchObject({ temperature: 29.5, humidity: null, irrigation: false });
      const stored = await prisma.reading.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(stored.deviceId).toBe(deviceId);
      expect(stored.temperature.toNumber()).toBe(29.5);
    });

    it('accepts an optional humidity (201)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/readings')
        .set('x-api-key', apiKey)
        .send({ ...validReading, humidity: 61.25 })
        .expect(201);

      expect(response.body.humidity).toBe(61.25);
    });

    it('rejects a request without API key (401)', () =>
      request(app.getHttpServer()).post('/api/readings').send(validReading).expect(401));

    it('rejects a request with a wrong API key (401)', () =>
      request(app.getHttpServer())
        .post('/api/readings')
        .set('x-api-key', 'wrong-key')
        .send(validReading)
        .expect(401));

    it.each([
      ['temperature above 125', { temperature: 125.1, irrigation: false }],
      ['temperature below -40', { temperature: -40.5, irrigation: false }],
      ['temperature as string', { temperature: '29.5', irrigation: false }],
      ['missing irrigation', { temperature: 29.5 }],
      ['unknown property', { ...validReading, createdAt: '2020-01-01T00:00:00Z' }],
    ])('rejects invalid data: %s (400)', async (_case, body) => {
      await request(app.getHttpServer())
        .post('/api/readings')
        .set('x-api-key', apiKey)
        .send(body)
        .expect(400);
    });
  });

  describe('POST /api/events', () => {
    const validEvent = { type: 'irrigation_off', temperature: 28.1, durationMin: 8.5 };

    it('stores the event with a valid API key (201)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/events')
        .set('x-api-key', apiKey)
        .send(validEvent)
        .expect(201);

      expect(response.body).toMatchObject(validEvent);
      const stored = await prisma.event.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(stored.deviceId).toBe(deviceId);
    });

    it('accepts a null temperature and no duration (201)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/events')
        .set('x-api-key', apiKey)
        .send({ type: 'sensor_error', temperature: null })
        .expect(201);

      expect(response.body).toMatchObject({
        type: 'sensor_error',
        temperature: null,
        durationMin: null,
      });
    });

    it('rejects a request without API key (401)', () =>
      request(app.getHttpServer()).post('/api/events').send(validEvent).expect(401));

    it('rejects a request with a wrong API key (401)', () =>
      request(app.getHttpServer())
        .post('/api/events')
        .set('x-api-key', 'wrong-key')
        .send(validEvent)
        .expect(401));

    it.each([
      ['unknown event type', { ...validEvent, type: 'riego_apagado' }],
      ['missing type', { temperature: 28.1 }],
      ['negative duration', { ...validEvent, durationMin: -1 }],
      ['unknown property', { ...validEvent, deviceId: 'abc' }],
    ])('rejects invalid data: %s (400)', async (_case, body) => {
      await request(app.getHttpServer())
        .post('/api/events')
        .set('x-api-key', apiKey)
        .send(body)
        .expect(400);
    });
  });

  it('GET /api/health reports the database as up (200)', () =>
    request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
      }));
});
