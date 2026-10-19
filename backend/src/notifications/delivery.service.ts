import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation.js';
import type {
  ChannelType,
  DeliveryStatus,
  NotificationChannel,
  NotificationDelivery,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { reportFileName } from '../reports/report.format.js';
import { ReportDataService } from '../reports/report-data.service.js';
import { renderPdf } from '../reports/renderers/pdf.renderer.js';
import { ChannelError } from './channels/channel-error.js';
import { publicDashboardUrl, telegramMessage, whatsappMessage } from './channels/channel-format.js';
import { TelegramClient } from './channels/telegram.client.js';
import { TwilioClient } from './channels/twilio.client.js';
import {
  DEFAULT_PREFERENCES,
  MAX_ATTEMPTS,
  retryDelayMs,
  shouldDeliver,
  whatsappWindowOpen,
} from './delivery-policy.js';
import type { NewNotification } from './notifications.service.js';

/** { type: 'daily_report', date: 'YYYY-MM-DD' }: the day's PDF report, sent with the summary. */
export interface DailyReportAttachment {
  type: 'daily_report';
  date: string;
}

type DeliveryWithChannel = NotificationDelivery & { channel: NotificationChannel };

const TELEGRAM_CAPTION_LIMIT = 1024;

/**
 * Outbox for Telegram and WhatsApp. Each message to each chat is a row that
 * is retried with back-off until it is sent, fails for good or is skipped.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  /** Tests drive processDue() themselves. */
  private readonly automatic: boolean;
  private readonly dashboardUrl: string | null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramClient,
    private readonly twilio: TwilioClient,
    private readonly reports: ReportDataService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.automatic = config.get('NODE_ENV', { infer: true }) !== NodeEnv.Test;
    this.dashboardUrl = publicDashboardUrl(config.get('DASHBOARD_URL', { infer: true }));
  }

  /** Channel types this server can send to (has credentials for). */
  private configuredTypes(): ChannelType[] {
    const types: ChannelType[] = [];
    if (this.telegram.configured) types.push('telegram');
    if (this.twilio.configured) types.push('whatsapp');
    return types;
  }

  /** Queues a message for the personal channels of the people who got it in their inbox. */
  async enqueueForUsers(
    inbox: { id: string; userId: string }[],
    message: NewNotification,
    now = new Date(),
  ): Promise<number> {
    if (inbox.length === 0) return 0;
    const notificationOf = new Map(inbox.map((entry) => [entry.userId, entry.id]));
    const channels = await this.prisma.notificationChannel.findMany({
      where: {
        userId: { in: [...notificationOf.keys()] },
        isGroup: false,
        active: true,
        type: { in: this.configuredTypes() },
      },
      include: { user: { select: { notificationPrefs: true } } },
    });
    const targets = channels.filter((channel) =>
      shouldDeliver(
        channel.user?.notificationPrefs ?? DEFAULT_PREFERENCES,
        channel.type,
        message,
        now,
      ),
    );
    return this.enqueue(
      targets.map((channel) => ({
        channelId: channel.id,
        notificationId: notificationOf.get(channel.userId!),
      })),
      message,
    );
  }

  /** Queues a message for every linked group chat (the farm's Telegram group). */
  async enqueueForGroups(message: NewNotification): Promise<number> {
    const groups = await this.prisma.notificationChannel.findMany({
      where: { isGroup: true, active: true, type: { in: this.configuredTypes() } },
      select: { id: true },
    });
    return this.enqueue(
      groups.map((group) => ({ channelId: group.id })),
      message,
    );
  }

  private async enqueue(
    targets: { channelId: string; notificationId?: string }[],
    message: NewNotification,
  ): Promise<number> {
    if (targets.length === 0) return 0;
    const { count } = await this.prisma.notificationDelivery.createMany({
      data: targets.map((target) => ({
        channelId: target.channelId,
        notificationId: target.notificationId ?? null,
        alertId: message.alertId ?? null,
        deviceId: message.deviceId ?? null,
        kind: message.kind,
        severity: message.severity ?? null,
        title: message.title,
        body: message.body,
        attachment: (message.attachment ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
    });
    if (this.automatic) setImmediate(() => void this.processDue());
    return count;
  }

  /** Safety net for retries and anything queued while the process was busy. */
  @Interval('notification-deliveries', 15_000)
  protected scheduledRun() {
    if (this.automatic) void this.processDue();
  }

  /** Sends what is due. Returns how many rows it handled. */
  async processDue(now = new Date(), limit = 25): Promise<number> {
    const types = this.configuredTypes();
    if (this.running || types.length === 0) return 0;
    this.running = true;
    try {
      const due = await this.prisma.notificationDelivery.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: now }, channel: { type: { in: types } } },
        include: { channel: true },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      const reports = new Map<string, { file: Buffer; name: string }>();
      for (const delivery of due) await this.deliver(delivery, now, reports);
      return due.length;
    } catch (error) {
      this.logger.error('Delivery run failed', error as Error);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async deliver(
    delivery: DeliveryWithChannel,
    now: Date,
    reports: Map<string, { file: Buffer; name: string }>,
  ) {
    const { channel } = delivery;
    if (!channel.active) return this.finish(delivery.id, 'skipped', 'El chat está desvinculado');
    if (channel.type === 'whatsapp' && !whatsappWindowOpen(channel.lastInboundAt, now)) {
      return this.finish(
        delivery.id,
        'skipped',
        'WhatsApp solo permite escribir dentro de las 24 h siguientes al último mensaje de la persona',
      );
    }

    try {
      const { id } =
        channel.type === 'telegram'
          ? await this.sendTelegram(delivery, reports)
          : await this.twilio.sendWhatsApp(
              channel.address,
              whatsappMessage(delivery, this.dashboardUrl),
            );
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'sent',
          attempts: { increment: 1 },
          sentAt: new Date(),
          providerMessageId: id,
          lastError: null,
        },
      });
    } catch (error) {
      await this.handleFailure(delivery, error, now);
    }
  }

  private async sendTelegram(
    delivery: DeliveryWithChannel,
    reports: Map<string, { file: Buffer; name: string }>,
  ) {
    const { html, buttons } = telegramMessage(delivery, this.dashboardUrl);
    const attachment = delivery.attachment as DailyReportAttachment | null;
    if (attachment?.type !== 'daily_report') {
      return this.telegram.sendMessage(delivery.channel.address, html, { buttons });
    }

    let report = reports.get(attachment.date);
    if (!report) {
      const data = await this.reports.build({
        fromDate: attachment.date,
        toDate: attachment.date,
        requester: { name: 'Resumen automático', email: '' },
      });
      report = { file: await renderPdf(data), name: `${reportFileName(data)}.pdf` };
      reports.set(attachment.date, report);
    }
    const caption =
      html.length > TELEGRAM_CAPTION_LIMIT ? `${html.slice(0, TELEGRAM_CAPTION_LIMIT - 1)}…` : html;
    return this.telegram.sendDocument(delivery.channel.address, report.file, report.name, caption);
  }

  private async handleFailure(delivery: DeliveryWithChannel, error: unknown, now: Date) {
    const failure =
      error instanceof ChannelError
        ? error
        : new ChannelError((error as Error).message ?? 'Error desconocido', { retryable: true });
    const attempts = delivery.attempts + 1;
    this.logger.warn(
      `Delivery ${delivery.id} to ${delivery.channel.type} failed (attempt ${attempts}): ${failure.message}`,
    );

    if (failure.disableChannel) {
      await this.prisma.notificationChannel.update({
        where: { id: delivery.channelId },
        data: { active: false },
      });
    }

    const retry = failure.retryable && attempts < MAX_ATTEMPTS;
    const delay = Math.max(retryDelayMs(attempts), (failure.retryAfterSeconds ?? 0) * 1000);
    await this.prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        attempts,
        status: retry ? 'pending' : 'failed',
        nextAttemptAt: retry ? new Date(now.getTime() + delay) : undefined,
        lastError: failure.message.slice(0, 500),
      },
    });
  }

  private finish(id: string, status: DeliveryStatus, reason: string) {
    return this.prisma.notificationDelivery.update({
      where: { id },
      data: { status, lastError: reason },
    });
  }

  /** Puts a failed or skipped message back in the queue. */
  async retry(id: string) {
    const { count } = await this.prisma.notificationDelivery.updateMany({
      where: { id, status: { in: ['failed', 'skipped'] } },
      data: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    if (count === 0) throw new NotFoundException('No hay un envío fallido con ese id');
    if (this.automatic) setImmediate(() => void this.processDue());
  }

  /** Latest messages sent (or not) to Telegram and WhatsApp, for administrators. */
  async list(params: {
    status?: DeliveryStatus;
    type?: ChannelType;
    limit: number;
    before?: Date;
  }) {
    const rows = await this.prisma.notificationDelivery.findMany({
      where: {
        status: params.status,
        channel: params.type ? { type: params.type } : undefined,
        createdAt: params.before ? { lt: params.before } : undefined,
      },
      include: {
        channel: {
          select: {
            type: true,
            label: true,
            isGroup: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      severity: row.severity,
      title: row.title,
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      channel: {
        type: row.channel.type,
        label: row.channel.label,
        isGroup: row.channel.isGroup,
        user: row.channel.user,
      },
    }));
  }
}
