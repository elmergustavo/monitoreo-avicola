import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.util.js';
import { hashApiKey } from '../src/devices/api-key.util.js';
import { DailySummaryService } from '../src/messaging/daily-summary.service.js';
import { TelegramBotService } from '../src/messaging/telegram-bot.service.js';
import { ChannelError } from '../src/notifications/channels/channel-error.js';
import type {
  InlineButton,
  TelegramUpdate,
} from '../src/notifications/channels/telegram.client.js';
import { TelegramClient } from '../src/notifications/channels/telegram.client.js';
import { TwilioClient } from '../src/notifications/channels/twilio.client.js';
import { DeliveryService } from '../src/notifications/delivery.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Records what would go to Telegram instead of calling it. */
class FakeTelegram {
  configured = true;
  sent: { chatId: string; html: string; buttons?: InlineButton[][] }[] = [];
  documents: { chatId: string; file: Buffer; fileName: string; caption: string }[] = [];
  answers: string[] = [];
  edits: InlineButton[][][] = [];
  failNext: ChannelError | null = null;

  async botUsername() {
    return 'lasierra_test_bot';
  }
  async sendMessage(
    chatId: string | number,
    html: string,
    options: { buttons?: InlineButton[][] } = {},
  ) {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.sent.push({ chatId: String(chatId), html, buttons: options.buttons });
    return { id: String(this.sent.length) };
  }
  async sendDocument(chatId: string | number, file: Buffer, fileName: string, caption: string) {
    this.documents.push({ chatId: String(chatId), file, fileName, caption });
    return { id: `doc-${this.documents.length}` };
  }
  async answerCallback(_id: string, text: string) {
    this.answers.push(text);
  }
  async editButtons(_chat: unknown, _message: number, buttons: InlineButton[][]) {
    this.edits.push(buttons);
  }
  async setCommands() {}
  async setWebhook() {}
  async deleteWebhook() {}
  async getUpdates() {
    return [];
  }
  to(chatId: string) {
    return this.sent.filter((m) => m.chatId === chatId);
  }
}

class FakeTwilio {
  configured = true;
  from = 'whatsapp:+14155238886';
  senderNumber = '+14155238886';
  sandboxJoinCode = 'join test-words';
  sent: { to: string; body: string }[] = [];
  validateSignature(signature: string | undefined) {
    return signature === 'valid-signature';
  }
  async sendWhatsApp(to: string, body: string) {
    this.sent.push({ to, body });
    return { id: `SM${this.sent.length}` };
  }
}

/**
 * Telegram and WhatsApp end to end with fake providers: linking chats,
 * alerts reaching them, "Lo atiendo" from a chat, preferences, retries,
 * WhatsApp's 24-hour window and the daily summary.
 */
describe('Telegram and WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let deliveries: DeliveryService;
  let bot: TelegramBotService;
  const telegram = new FakeTelegram();
  const twilio = new FakeTwilio();

  const suffix = `msg${Date.now().toString(36)}`;
  const PASSWORD = 'Correct-Horse-9';
  const apiKey = randomBytes(32).toString('hex');
  const roleKeys = [`e2e-watch-${suffix}`, `e2e-manage-${suffix}`];
  // Telegram ids and a Guatemalan number unique to this run.
  const base = Date.now() % 1_000_000_000;
  const tgWatcher = String(base + 1);
  const tgManager = String(base + 2);
  const tgGroup = String(-1_000_000_000_000 - base);
  const localPhone = String(30_000_000 + (base % 9_999_999));
  const phone = `+502${localPhone}`;

  let deviceId: string;
  let groupId: string | undefined;
  let watcher: { id: string; token: string };
  let manager: { id: string; token: string };
  let updateId = 1;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const esp32Event = (body: object) =>
    http().post('/api/events').set('x-api-key', apiKey).send(body).expect(201);
  const whatsapp = (body: string, signature = 'valid-signature') =>
    http()
      .post('/api/whatsapp/webhook')
      .set('x-twilio-signature', signature)
      .type('form')
      .send({ From: `whatsapp:${phone}`, Body: body });

  const privateMessage = (fromId: string, text: string): TelegramUpdate => ({
    update_id: updateId++,
    message: {
      message_id: updateId,
      from: { id: Number(fromId), first_name: 'E2E', username: `user${fromId}` },
      chat: { id: Number(fromId), type: 'private' },
      text,
    },
  });

  async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
    for (let i = 0; i < 50; i++) {
      const value = await read();
      if (done(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error('Condition not met in time');
  }

  const openAlert = (kind: string) =>
    eventually(
      () =>
        prisma.alert.findFirst({
          where: { deviceId, kind: kind as never, status: { not: 'resolved' } },
        }),
      (alert) => alert !== null,
    ).then((alert) => alert!);

  const channelOf = (type: 'telegram' | 'whatsapp', address: string) =>
    prisma.notificationChannel.findUniqueOrThrow({ where: { type_address: { type, address } } });

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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TelegramClient)
      .useValue(telegram)
      .overrideProvider(TwilioClient)
      .useValue(twilio)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    deliveries = app.get(DeliveryService);
    bot = app.get(TelegramBotService);

    const device = await prisma.device.create({
      data: {
        name: `e2e-msg-${suffix}`,
        shed: 'E2E',
        apiKeyHash: hashApiKey(apiKey),
        settings: { create: {} },
        lastSeenAt: new Date(),
      },
    });
    deviceId = device.id;
    watcher = await userWith('watcher', roleKeys[0], ['telemetry.read']);
    manager = await userWith('manager', roleKeys[1], ['telemetry.read', 'alerts.manage']);
  });

  afterAll(async () => {
    if (prisma) {
      // Guard: with an undefined id, delete/deleteMany could match every row.
      if (deviceId) await prisma.device.delete({ where: { id: deviceId } });
      if (groupId) await prisma.notificationChannel.deleteMany({ where: { id: groupId } });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'e2e-', endsWith: `-${suffix}@test.local` } },
      });
      await prisma.role.deleteMany({ where: { key: { in: roleKeys } } });
    }
    await app?.close();
  });

  it('reports which providers are configured and the default preferences', async () => {
    const { body } = await http()
      .get('/api/notifications/settings')
      .set(bearer(watcher.token))
      .expect(200);
    expect(body.providers).toEqual({
      telegram: { configured: true, botUsername: 'lasierra_test_bot' },
      whatsapp: { configured: true, number: '+14155238886', sandboxJoinCode: 'join test-words' },
    });
    expect(body.preferences).toMatchObject({
      telegram: true,
      whatsapp: true,
      includeWarnings: true,
      dailySummary: true,
    });
    expect(body.channels).toEqual([]);
  });

  it('links a personal Telegram chat with a one-time code', async () => {
    const { body } = await http()
      .post('/api/notifications/channels/telegram/link')
      .set(bearer(watcher.token))
      .expect(201);
    expect(body.code).toMatch(/^\d{6}$/);
    expect(body.url).toBe(`https://t.me/lasierra_test_bot?start=${body.code}`);

    await bot.handleUpdate(privateMessage(tgWatcher, `/start ${body.code}`));
    expect(telegram.to(tgWatcher).at(-1)?.html).toContain('Listo, E2E');
    expect(await channelOf('telegram', tgWatcher)).toMatchObject({
      userId: watcher.id,
      label: `@user${tgWatcher}`,
    });

    // The code works only once.
    await bot.handleUpdate(privateMessage(tgWatcher, `/start ${body.code}`));
    expect(telegram.to(tgWatcher).at(-1)?.html).toContain('no es válido');

    const manager_ = await http()
      .post('/api/notifications/channels/telegram/link')
      .set(bearer(manager.token));
    await bot.handleUpdate(privateMessage(tgManager, `/start ${manager_.body.code}`));
    expect((await channelOf('telegram', tgManager)).userId).toBe(manager.id);
  });

  it('links WhatsApp when the person writes the code from that number', async () => {
    const { body } = await http()
      .post('/api/notifications/channels/whatsapp/link')
      .set(bearer(watcher.token))
      .send({ phone: localPhone })
      .expect(201);
    expect(body).toMatchObject({ phone, number: '+14155238886', message: `VINCULAR ${body.code}` });
    expect(body.url).toBe(`https://wa.me/14155238886?text=VINCULAR%20${body.code}`);

    await whatsapp(`VINCULAR ${body.code}`, 'forged').expect(403);
    const reply = await whatsapp(`vincular ${body.code}`).expect(200);
    expect(reply.headers['content-type']).toContain('text/xml');
    expect(reply.text).toContain('Listo, E2E');

    const settings = await http().get('/api/notifications/settings').set(bearer(watcher.token));
    const wa = settings.body.channels.find((c: { type: string }) => c.type === 'whatsapp');
    expect(wa).toMatchObject({ label: `+502 •••• ${phone.slice(-4)}`, windowOpen: true });

    await http()
      .post('/api/notifications/channels/whatsapp/link')
      .set(bearer(watcher.token))
      .send({ phone: '123' })
      .expect(400);
  });

  it('lets only alert managers link the farm group', async () => {
    await http().post('/api/notifications/groups/link').set(bearer(watcher.token)).expect(403);
    const { body } = await http()
      .post('/api/notifications/groups/link')
      .set(bearer(manager.token))
      .expect(201);
    expect(body.command).toBe(`/vincular ${body.code}`);

    await bot.handleUpdate({
      update_id: updateId++,
      message: {
        message_id: 1,
        from: { id: Number(tgManager), first_name: 'E2E' },
        chat: { id: Number(tgGroup), type: 'supergroup', title: 'Granja La Sierra (e2e)' },
        text: `/vincular@lasierra_test_bot ${body.code}`,
      },
    });
    expect(telegram.to(tgGroup).at(-1)?.html).toContain('Grupo vinculado');
    const group = await channelOf('telegram', tgGroup);
    groupId = group.id;
    expect(group).toMatchObject({ isGroup: true, userId: null, linkedById: manager.id });

    const groups = await http()
      .get('/api/notifications/groups')
      .set(bearer(manager.token))
      .expect(200);
    expect(groups.body.map((g: { id: string }) => g.id)).toContain(group.id);
  });

  it('sends a new alert to every linked chat and the group, with "Lo atiendo"', async () => {
    await esp32Event({ type: 'heat_alert_no_irrigation', temperature: 33.2 });
    const alert = await openAlert('heat_no_irrigation');
    await eventually(
      () => prisma.notificationDelivery.count({ where: { alertId: alert.id } }),
      (count) => count >= 4,
    );
    await deliveries.processDue();

    for (const chat of [tgWatcher, tgManager, tgGroup]) {
      const message = telegram.to(chat).find((m) => m.html.includes(`e2e-msg-${suffix}`));
      expect(message?.html).toContain('🔴 <b>Calor sin riego');
      expect(message?.buttons?.[0][0]).toEqual({
        text: '✋ Lo atiendo',
        callback_data: `ack:${alert.id}`,
      });
    }
    const wa = twilio.sent.find((m) => m.to === phone && m.body.includes('Calor sin riego'));
    expect(wa?.body).toContain('Responde *OK* si tú la atiendes.');
    expect(
      await prisma.notificationDelivery.count({
        where: { alertId: alert.id, status: { not: 'sent' } },
      }),
    ).toBe(0);
  });

  it('records "Lo atiendo" tapped in the group by a linked person', async () => {
    const alert = await openAlert('heat_no_irrigation');
    const callback = (fromId: string) =>
      bot.handleUpdate({
        update_id: updateId++,
        callback_query: {
          id: `cb${updateId}`,
          from: { id: Number(fromId), first_name: 'E2E' },
          message: { message_id: 7, chat: { id: Number(tgGroup), type: 'supergroup' } },
          data: `ack:${alert.id}`,
        },
      });

    // Someone in the group who never linked their own Telegram.
    await callback('42');
    expect(telegram.answers.at(-1)).toContain('Primero vincula tu Telegram');

    await callback(tgWatcher);
    expect(telegram.answers.at(-1)).toBe('Listo: quedó registrado que tú la atiendes.');
    expect(telegram.edits.at(-1)).toEqual([]);
    expect(await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).toMatchObject({
      status: 'acknowledged',
      acknowledgedById: watcher.id,
    });

    await callback(tgManager);
    expect(telegram.answers.at(-1)).toBe('Ya la atiende E2E watcher.');
  });

  it("follows each person's preferences", async () => {
    await http()
      .patch('/api/notifications/preferences')
      .set(bearer(watcher.token))
      .send({ quietStart: '22:00' })
      .expect(400);
    await http()
      .patch('/api/notifications/preferences')
      .set(bearer(watcher.token))
      .send({ quietStart: '25:00', quietEnd: '05:00' })
      .expect(400);
    const prefs = await http()
      .patch('/api/notifications/preferences')
      .set(bearer(watcher.token))
      .send({ includeWarnings: false })
      .expect(200);
    expect(prefs.body.includeWarnings).toBe(false);

    await esp32Event({ type: 'prolonged_irrigation_alert', temperature: 29 });
    const alert = await openAlert('prolonged_irrigation');
    const rows = await eventually(
      () =>
        prisma.notificationDelivery.findMany({
          where: { alertId: alert.id },
          include: { channel: true },
        }),
      (list) => list.length >= 2,
    );
    const owners = rows.map((row) => row.channel.userId ?? 'group');
    expect(owners).toContain(manager.id);
    expect(owners).toContain('group');
    expect(owners).not.toContain(watcher.id);
  });

  it('acknowledges by replying OK on WhatsApp and answers ESTADO', async () => {
    await esp32Event({ type: 'sensor_error', temperature: null });
    const alert = await openAlert('sensor_error');
    await eventually(
      () =>
        prisma.notificationDelivery.count({
          where: { alertId: alert.id, channel: { type: 'whatsapp' } },
        }),
      (count) => count === 1,
    );
    await deliveries.processDue();

    const reply = await whatsapp('Ok!').expect(200);
    expect(reply.text).toContain('quedó registrado que tú atiendes *Error del sensor');
    expect(
      (await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } })).acknowledgedById,
    ).toBe(watcher.id);

    const status = await whatsapp('estado').expect(200);
    expect(status.text).toContain(`*e2e-msg-${suffix}*`);

    const unknown = await http()
      .post('/api/whatsapp/webhook')
      .set('x-twilio-signature', 'valid-signature')
      .type('form')
      .send({ From: 'whatsapp:+50211112222', Body: 'hola' })
      .expect(200);
    expect(unknown.text).toContain('no está vinculado');
  });

  it('retries temporary failures and stops using a chat that blocked the bot', async () => {
    telegram.failNext = new ChannelError('Telegram: Too Many Requests', {
      retryable: true,
      retryAfterSeconds: 60,
    });
    const test = await http()
      .post('/api/notifications/test')
      .set(bearer(watcher.token))
      .expect(200);
    expect(test.body.channels).toBe(2);
    const now = new Date();
    await deliveries.processDue(now);

    const channel = await channelOf('telegram', tgWatcher);
    const [pending] = await prisma.notificationDelivery.findMany({
      where: { channelId: channel.id, kind: 'test' },
    });
    expect(pending).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError: 'Telegram: Too Many Requests',
    });
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(now.getTime() + 60_000);

    telegram.failNext = new ChannelError('Telegram: Forbidden: bot was blocked by the user', {
      retryable: false,
      disableChannel: true,
    });
    await deliveries.processDue(new Date(now.getTime() + 61_000));
    expect(
      await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({
      status: 'failed',
      attempts: 2,
    });
    expect((await channelOf('telegram', tgWatcher)).active).toBe(false);

    // Retried by an administrator: the chat is off, so it is skipped.
    await http()
      .post(`/api/notifications/deliveries/${pending.id}/retry`)
      .set(bearer(watcher.token))
      .expect(403);
    await http()
      .post(`/api/notifications/deliveries/${pending.id}/retry`)
      .set(bearer(manager.token))
      .expect(204);
    await deliveries.processDue();
    expect(
      (await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: pending.id } })).status,
    ).toBe('skipped');

    const failed = await http()
      .get('/api/notifications/deliveries')
      .query({ status: 'skipped', type: 'telegram' })
      .set(bearer(manager.token))
      .expect(200);
    expect(failed.body.find((d: { id: string }) => d.id === pending.id)).toMatchObject({
      kind: 'test',
      channel: { type: 'telegram', isGroup: false, user: { id: watcher.id, name: 'E2E watcher' } },
    });
  });

  it('skips WhatsApp outside the 24-hour window', async () => {
    const channel = await channelOf('whatsapp', phone);
    await prisma.notificationChannel.update({
      where: { id: channel.id },
      data: { lastInboundAt: new Date(Date.now() - 25 * 60 * 60_000) },
    });
    await http().post('/api/notifications/test').set(bearer(watcher.token)).expect(200);
    await deliveries.processDue();
    const [latest] = await prisma.notificationDelivery.findMany({
      where: { channelId: channel.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(latest.status).toBe('skipped');
    expect(latest.lastError).toContain('24 h');
  });

  it('sends the daily summary with the PDF report in Telegram', async () => {
    const summary = app.get(DailySummaryService);
    await summary.send(new Date(), [watcher.id, manager.id]);

    const inbox = await prisma.notification.findFirst({
      where: { userId: watcher.id, kind: 'daily_summary' },
    });
    expect(inbox?.title).toMatch(/^Resumen del día \d{2}\/\d{2}$/);
    expect(inbox?.body).toContain(`e2e-msg-${suffix}`);

    await deliveries.processDue();
    const doc = telegram.documents.find((d) => d.chatId === tgGroup);
    expect(doc?.file.subarray(0, 4).toString()).toBe('%PDF');
    expect(doc?.fileName).toMatch(/\.pdf$/);
    expect(doc?.caption).toContain('📋 <b>Resumen del día');
    expect(telegram.documents.some((d) => d.chatId === tgManager)).toBe(true);
  });

  it('lets people unlink only their own chats', async () => {
    const channel = await channelOf('whatsapp', phone);
    await http()
      .delete(`/api/notifications/channels/${channel.id}`)
      .set(bearer(manager.token))
      .expect(404);
    await http()
      .delete(`/api/notifications/channels/${channel.id}`)
      .set(bearer(watcher.token))
      .expect(204);
    const reply = await whatsapp('estado').expect(200);
    expect(reply.text).toContain('no está vinculado');
  });
});
