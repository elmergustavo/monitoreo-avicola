import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type ChannelLinkCode,
  type ChannelType,
  type NotificationChannel,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelegramClient } from './channels/telegram.client.js';
import { TwilioClient } from './channels/twilio.client.js';
import {
  DEFAULT_PREFERENCES,
  maskPhone,
  normalizePhone,
  whatsappWindowOpen,
  type DeliveryPreferences,
} from './delivery-policy.js';

export const LINK_CODE_TTL_MS = 15 * 60_000;
/** Wrong codes allowed per chat or phone in LIMIT_WINDOW_MS, against guessing. */
const MAX_FAILED_ATTEMPTS = 5;
const LIMIT_WINDOW_MS = 10 * 60_000;

export type RedeemResult =
  | { ok: true; code: ChannelLinkCode }
  | { ok: false; reason: 'invalid' | 'expired' | 'wrong_number' | 'too_many_attempts' };

const channelView = (channel: NotificationChannel, now = new Date()) => ({
  id: channel.id,
  type: channel.type,
  label: channel.label,
  isGroup: channel.isGroup,
  active: channel.active,
  createdAt: channel.createdAt,
  lastInboundAt: channel.lastInboundAt,
  /** WhatsApp: whether messages can reach this number right now. */
  windowOpen: channel.type === 'whatsapp' ? whatsappWindowOpen(channel.lastInboundAt, now) : null,
});

@Injectable()
export class ChannelsService {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramClient,
    private readonly twilio: TwilioClient,
  ) {}

  /** What the dashboard needs to show which channels can be used. */
  async providers() {
    return {
      telegram: {
        configured: this.telegram.configured,
        botUsername: await this.telegram.botUsername(),
      },
      whatsapp: {
        configured: this.twilio.configured,
        number: this.twilio.configured ? this.twilio.senderNumber : null,
        sandboxJoinCode: this.twilio.configured ? (this.twilio.sandboxJoinCode ?? null) : null,
      },
    };
  }

  async settings(userId: string) {
    const [providers, preferences, channels] = await Promise.all([
      this.providers(),
      this.preferences(userId),
      this.prisma.notificationChannel.findMany({
        where: { userId, isGroup: false },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { providers, preferences, channels: channels.map((c) => channelView(c)) };
  }

  async preferences(userId: string): Promise<DeliveryPreferences> {
    const prefs = await this.prisma.notificationPreferences.findUnique({ where: { userId } });
    if (!prefs) return DEFAULT_PREFERENCES;
    const { userId: _userId, updatedAt: _updatedAt, ...values } = prefs;
    return values;
  }

  async updatePreferences(userId: string, changes: Partial<DeliveryPreferences>) {
    const next = { ...(await this.preferences(userId)), ...changes };
    if (Boolean(next.quietStart) !== Boolean(next.quietEnd)) {
      throw new BadRequestException('Indica la hora de inicio y de fin del horario de silencio');
    }
    await this.prisma.notificationPreferences.upsert({
      where: { userId },
      update: next,
      create: { userId, ...next },
    });
    return next;
  }

  async groups() {
    const groups = await this.prisma.notificationChannel.findMany({
      where: { isGroup: true },
      include: { linkedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return groups.map((group) => ({ ...channelView(group), linkedBy: group.linkedBy }));
  }

  /**
   * One-time code. Telegram: sent as /start <code> (or /vincular <code> in a
   * group). WhatsApp: the person writes "VINCULAR <code>" from that number.
   */
  async createLinkCode(
    userId: string,
    type: ChannelType,
    options: { isGroup?: boolean; phone?: string } = {},
  ) {
    let address: string | null = null;
    if (type === 'whatsapp') {
      address = normalizePhone(options.phone ?? '');
      if (!address)
        throw new BadRequestException('Escribe un número válido, por ejemplo 5555 1234');
    }
    const isGroup = options.isGroup ?? false;

    // Only the latest code of each kind is valid.
    await this.prisma.channelLinkCode.deleteMany({ where: { userId, type, isGroup } });
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = String(randomInt(100_000, 1_000_000));
      try {
        await this.prisma.channelLinkCode.create({
          data: { code, userId, type, isGroup, address, expiresAt },
        });
        return { code, expiresAt, phone: address };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          continue;
        throw error;
      }
    }
    throw new Error('Could not generate a unique link code');
  }

  /** Validates and consumes a code. `source` identifies the chat or phone, to limit guessing. */
  async redeem(
    rawCode: string,
    expected: { type: ChannelType; isGroup: boolean; address?: string },
    source: string,
  ): Promise<RedeemResult> {
    if (this.tooManyFailures(source)) return { ok: false, reason: 'too_many_attempts' };
    const code = rawCode.trim();
    const row = /^\d{6}$/.test(code)
      ? await this.prisma.channelLinkCode.findUnique({ where: { code } })
      : null;

    if (!row || row.type !== expected.type || row.isGroup !== expected.isGroup) {
      this.noteFailure(source);
      return { ok: false, reason: 'invalid' };
    }
    if (row.expiresAt.getTime() < Date.now()) {
      await this.prisma.channelLinkCode.delete({ where: { code } }).catch(() => undefined);
      return { ok: false, reason: 'expired' };
    }
    if (row.address && expected.address && row.address !== expected.address) {
      this.noteFailure(source);
      return { ok: false, reason: 'wrong_number' };
    }
    // deleteMany: if two messages race, only one wins the code.
    const { count } = await this.prisma.channelLinkCode.deleteMany({ where: { code } });
    if (count === 0) return { ok: false, reason: 'invalid' };
    return { ok: true, code: row };
  }

  /** A person's own chat. Replaces their previous chat of the same type. */
  async linkPersonal(userId: string, type: ChannelType, address: string, label: string | null) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.notificationChannel.deleteMany({
        where: { userId, type, isGroup: false, NOT: { address } },
      });
      return tx.notificationChannel.upsert({
        where: { type_address: { type, address } },
        update: {
          userId,
          isGroup: false,
          active: true,
          label,
          lastInboundAt: now,
          linkedById: userId,
        },
        create: {
          userId,
          type,
          address,
          label,
          isGroup: false,
          lastInboundAt: now,
          linkedById: userId,
        },
      });
    });
  }

  linkGroup(linkedById: string, chatId: string, title: string | null) {
    return this.prisma.notificationChannel.upsert({
      where: { type_address: { type: 'telegram', address: chatId } },
      update: { userId: null, isGroup: true, active: true, label: title, linkedById },
      create: { type: 'telegram', address: chatId, label: title, isGroup: true, linkedById },
    });
  }

  findChannel(type: ChannelType, address: string) {
    return this.prisma.notificationChannel.findUnique({
      where: { type_address: { type, address } },
      include: { user: { select: { id: true, name: true, active: true } } },
    });
  }

  touchInbound(channelId: string) {
    return this.prisma.notificationChannel.update({
      where: { id: channelId },
      data: { lastInboundAt: new Date() },
    });
  }

  async deactivate(type: ChannelType, address: string) {
    await this.prisma.notificationChannel.updateMany({
      where: { type, address },
      data: { active: false },
    });
  }

  /** Telegram turns a group into a supergroup with a new id. */
  async moveAddress(type: ChannelType, from: string, to: string) {
    await this.prisma.notificationChannel.updateMany({
      where: { type, address: from },
      data: { address: to },
    });
  }

  async unlinkOwn(userId: string, id: string) {
    const { count } = await this.prisma.notificationChannel.deleteMany({
      where: { id, userId, isGroup: false },
    });
    if (count === 0) throw new NotFoundException('Canal no encontrado');
  }

  async unlinkGroup(id: string) {
    const group = await this.prisma.notificationChannel.findFirst({ where: { id, isGroup: true } });
    if (!group) throw new NotFoundException('Grupo no encontrado');
    await this.prisma.notificationChannel.delete({ where: { id } });
    return group;
  }

  maskedPhone(phone: string) {
    return maskPhone(phone);
  }

  private tooManyFailures(source: string) {
    const recent = (this.failures.get(source) ?? []).filter(
      (at) => Date.now() - at < LIMIT_WINDOW_MS,
    );
    this.failures.set(source, recent);
    return recent.length >= MAX_FAILED_ATTEMPTS;
  }

  private noteFailure(source: string) {
    if (this.failures.size > 5_000) this.failures.clear();
    this.failures.set(source, [...(this.failures.get(source) ?? []), Date.now()]);
  }
}
