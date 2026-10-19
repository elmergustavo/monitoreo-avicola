import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Subscription } from 'rxjs';
import { ALERT_LABELS } from '../alerts/alert-messages.js';
import { AuditService } from '../audit/audit.service.js';
import { NodeEnv, type EnvironmentVariables } from '../config/env.validation.js';
import { ChannelsService, type RedeemResult } from '../notifications/channels.service.js';
import {
  ACK_CALLBACK_PREFIX,
  publicDashboardUrl,
  shedUrl,
} from '../notifications/channels/channel-format.js';
import {
  escapeHtml,
  TelegramClient,
  type InlineButton,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
  type TelegramUser,
} from '../notifications/channels/telegram.client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelemetryStreamService } from '../telemetry/telemetry-stream.service.js';
import { bold, FarmCommandsService } from './farm-commands.service.js';

const COMMANDS = [
  { command: 'estado', description: 'Temperatura y riego de cada galpón' },
  { command: 'alertas', description: 'Alertas abiertas' },
  { command: 'ayuda', description: 'Qué puede hacer este bot' },
  { command: 'desvincular', description: 'Dejar de recibir alertas en este chat' },
];

const HELP = [
  'Soy el bot de monitoreo de <b>Granjas La Sierra</b>.',
  '',
  '/estado: temperatura y riego de cada galpón',
  '/alertas: alertas abiertas, con botón para atenderlas',
  '/desvincular: dejar de recibir alertas aquí',
  '',
  'Cuando llegue una alerta, toca <b>✋ Lo atiendo</b> para que el equipo sepa que alguien va en camino.',
].join('\n');

const NOT_LINKED =
  'Este chat no está vinculado. Entra al dashboard → <b>Mi perfil</b> → <b>Telegram</b> y toca "Vincular".';

const REDEEM_ERRORS: Record<Exclude<RedeemResult, { ok: true }>['reason'], string> = {
  invalid: 'Ese código no es válido. Genera uno nuevo en el dashboard.',
  expired: 'Ese código ya venció (duran 15 minutos). Genera uno nuevo en el dashboard.',
  wrong_number: 'Ese código es para otro chat.',
  too_many_attempts: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
};

const POLL_TIMEOUT_S = 25;

/**
 * Receives what people do in Telegram: linking chats, commands and the
 * "Lo atiendo" button. Long polling locally, webhook in production.
 */
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly mode: 'polling' | 'webhook';
  private readonly webhookUrl?: string;
  private readonly webhookSecret?: string;
  private readonly dashboardUrl: string | null;
  private readonly enabled: boolean;
  private readonly abort = new AbortController();
  private subscription?: Subscription;

  constructor(
    private readonly telegram: TelegramClient,
    private readonly channels: ChannelsService,
    private readonly commands: FarmCommandsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stream: TelemetryStreamService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.mode = config.get('TELEGRAM_MODE', { infer: true });
    this.webhookUrl = config.get('TELEGRAM_WEBHOOK_URL', { infer: true });
    this.webhookSecret = config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    this.dashboardUrl = publicDashboardUrl(config.get('DASHBOARD_URL', { infer: true }));
    this.enabled =
      this.telegram.configured && config.get('NODE_ENV', { infer: true }) !== NodeEnv.Test;
  }

  async onApplicationBootstrap() {
    if (!this.enabled) return;
    // Tell the farm group who took an alert, wherever it was taken (dashboard, Telegram, WhatsApp).
    this.subscription = this.stream.messages$.subscribe((message) => {
      if (message.type === 'alert' && message.alert.status === 'acknowledged') {
        void this.announceAcknowledgement(message.alert.id);
      }
    });

    try {
      await this.telegram.setCommands(COMMANDS);
      if (this.mode === 'webhook') {
        if (!this.webhookUrl) {
          this.logger.warn(
            'TELEGRAM_MODE=webhook but TELEGRAM_WEBHOOK_URL is empty: no updates will arrive',
          );
          return;
        }
        await this.telegram.setWebhook(this.webhookUrl, this.webhookSecret);
        this.logger.log(`Telegram webhook set to ${this.webhookUrl}`);
      } else {
        await this.telegram.deleteWebhook();
        this.logger.log(`Telegram bot @${await this.telegram.botUsername()} listening (polling)`);
        void this.poll();
      }
    } catch (error) {
      this.logger.error(`Telegram setup failed: ${(error as Error).message}`);
    }
  }

  onModuleDestroy() {
    this.abort.abort();
    this.subscription?.unsubscribe();
  }

  /** True when the webhook call carries our secret. */
  verifyWebhookSecret(received: string | undefined): boolean {
    return Boolean(this.webhookSecret) && received === this.webhookSecret;
  }

  private async poll() {
    let offset = 0;
    while (!this.abort.signal.aborted) {
      try {
        const updates = await this.telegram.getUpdates(offset, POLL_TIMEOUT_S, this.abort.signal);
        for (const update of updates) {
          offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (error) {
        if (this.abort.signal.aborted) return;
        this.logger.warn(`Telegram polling error: ${(error as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }

  /** Entry point for polling and the webhook. Never throws. */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (update.callback_query) await this.onCallback(update.callback_query);
      else if (update.message) await this.onMessage(update.message);
      else if (update.my_chat_member) {
        const status = update.my_chat_member.new_chat_member.status;
        if (status === 'left' || status === 'kicked') {
          await this.channels.deactivate('telegram', String(update.my_chat_member.chat.id));
        }
      }
    } catch (error) {
      this.logger.error(`Could not handle Telegram update ${update.update_id}`, error as Error);
    }
  }

  private async onMessage(message: TelegramMessage) {
    const chatId = String(message.chat.id);
    if (message.migrate_to_chat_id) {
      await this.channels.moveAddress('telegram', chatId, String(message.migrate_to_chat_id));
      return;
    }
    const parsed = /^\/([a-zA-Z_]+)(?:@(\w+))?(?:\s+(.+))?$/s.exec(message.text?.trim() ?? '');
    if (!parsed) {
      if (message.chat.type === 'private') await this.reply(message, HELP);
      return;
    }
    const [, rawCommand, mention, rawArgument] = parsed;
    // In groups, ignore commands addressed to other bots.
    if (mention && mention.toLowerCase() !== (await this.telegram.botUsername())?.toLowerCase())
      return;
    const command = rawCommand.toLowerCase();
    const argument = rawArgument?.trim() ?? '';
    const isGroup = message.chat.type === 'group' || message.chat.type === 'supergroup';

    if ((command === 'start' || command === 'vincular') && argument) {
      return isGroup ? this.linkGroup(message, argument) : this.linkPersonal(message, argument);
    }

    const channel = await this.channels.findChannel('telegram', chatId);
    const linked =
      channel?.active && (channel.isGroup ? isGroup : await this.commands.canWatch(channel.userId));

    switch (command) {
      case 'start':
      case 'ayuda':
      case 'help':
        return this.reply(message, linked ? HELP : `${HELP}\n\n${NOT_LINKED}`);
      case 'estado':
        if (!linked) return this.reply(message, NOT_LINKED);
        return this.reply(message, await this.commands.statusText('telegram'));
      case 'alertas':
        if (!linked) return this.reply(message, NOT_LINKED);
        return this.sendOpenAlerts(message);
      case 'desvincular':
        if (!channel) return this.reply(message, 'Este chat no estaba vinculado.');
        if (channel.isGroup && !(await this.isManager(message.from))) {
          return this.reply(message, 'Solo un encargado vinculado puede desvincular el grupo.');
        }
        await this.channels.deactivate('telegram', chatId);
        return this.reply(message, 'Listo: este chat ya no recibirá alertas.');
      default:
        if (!isGroup) return this.reply(message, HELP);
    }
  }

  private async linkPersonal(message: TelegramMessage, code: string) {
    const chatId = String(message.chat.id);
    const redeemed = await this.channels.redeem(
      code,
      { type: 'telegram', isGroup: false },
      `tg:${chatId}`,
    );
    if (!redeemed.ok) return this.reply(message, REDEEM_ERRORS[redeemed.reason]);

    const label = message.from?.username
      ? `@${message.from.username}`
      : (message.from?.first_name ?? null);
    const channel = await this.channels.linkPersonal(
      redeemed.code.userId,
      'telegram',
      chatId,
      label,
    );
    await this.audit.record({
      userId: redeemed.code.userId,
      action: 'notifications.channel_linked',
      entityType: 'notification_channel',
      entityId: channel.id,
      metadata: { type: 'telegram', label },
    });
    const name = await this.commands.userName(redeemed.code.userId);
    return this.reply(
      message,
      `✅ Listo, ${escapeHtml(name.split(' ')[0])}. Desde ahora recibirás aquí las alertas de los galpones.\n\n${HELP}`,
    );
  }

  private async linkGroup(message: TelegramMessage, code: string) {
    const chatId = String(message.chat.id);
    const redeemed = await this.channels.redeem(
      code,
      { type: 'telegram', isGroup: true },
      `tg:${chatId}`,
    );
    if (!redeemed.ok) return this.reply(message, REDEEM_ERRORS[redeemed.reason]);

    const title = message.chat.title ?? 'Grupo';
    const channel = await this.channels.linkGroup(redeemed.code.userId, chatId, title);
    await this.audit.record({
      userId: redeemed.code.userId,
      action: 'notifications.group_linked',
      entityType: 'notification_channel',
      entityId: channel.id,
      metadata: { title },
    });
    return this.reply(
      message,
      `✅ Grupo vinculado. Aquí llegarán las alertas de los galpones y el resumen diario.\n\nCada persona debe vincular su Telegram en <b>Mi perfil</b> para poder tocar <b>✋ Lo atiendo</b>.`,
    );
  }

  private async sendOpenAlerts(message: TelegramMessage) {
    const alerts = await this.commands.openAlerts();
    if (alerts.length === 0) return this.reply(message, '🟢 No hay alertas abiertas.');
    for (const alert of alerts) {
      const row: InlineButton[] = [];
      if (alert.status === 'open') {
        row.push({ text: '✋ Lo atiendo', callback_data: `${ACK_CALLBACK_PREFIX}${alert.id}` });
      }
      const link = shedUrl(this.dashboardUrl, alert.device.id);
      if (link) row.push({ text: '📊 Ver galpón', url: link });
      await this.telegram.sendMessage(message.chat.id, this.commands.alertLine(alert, 'telegram'), {
        buttons: row.length ? [row] : undefined,
      });
    }
  }

  private async onCallback(query: TelegramCallbackQuery) {
    if (!query.data?.startsWith(ACK_CALLBACK_PREFIX)) {
      await this.telegram.answerCallback(query.id, '');
      return;
    }
    const alertId = query.data.slice(ACK_CALLBACK_PREFIX.length);
    // A person is recognized by their own linked chat (private chat id = Telegram user id).
    const personal = await this.channels.findChannel('telegram', String(query.from.id));
    const userId = personal?.active && !personal.isGroup ? personal.userId : null;
    if (!userId) {
      await this.telegram.answerCallback(
        query.id,
        'Primero vincula tu Telegram en el dashboard (Mi perfil) para atender alertas.',
      );
      return;
    }

    const outcome = await this.commands.acknowledge(userId, alertId, 'telegram');
    const text = {
      acknowledged: 'Listo: quedó registrado que tú la atiendes.',
      already: outcome.result === 'already' ? `Ya la atiende ${outcome.by}.` : '',
      resolved: 'Esta alerta ya se resolvió.',
      not_found: 'Esta alerta ya no existe.',
      forbidden: 'Tu usuario no tiene permiso para atender alertas.',
    }[outcome.result];
    await this.telegram.answerCallback(query.id, text);

    // Remove the "Lo atiendo" button from the message that was tapped.
    if (query.message && outcome.result !== 'forbidden') {
      const link =
        outcome.result === 'acknowledged' || outcome.result === 'already'
          ? shedUrl(this.dashboardUrl, outcome.alert.device.id)
          : null;
      await this.telegram
        .editButtons(
          query.message.chat.id,
          query.message.message_id,
          link ? [[{ text: '📊 Ver galpón', url: link }]] : [],
        )
        .catch(() => undefined);
    }
  }

  /** "✋ Cesia atiende: Calor sin riego · Galpón 1" in every linked group. */
  private async announceAcknowledgement(alertId: string) {
    try {
      const alert = await this.prisma.alert.findUnique({
        where: { id: alertId },
        include: { device: { select: { name: true } }, acknowledgedBy: { select: { name: true } } },
      });
      if (!alert?.acknowledgedBy) return;
      const groups = await this.prisma.notificationChannel.findMany({
        where: { type: 'telegram', isGroup: true, active: true },
      });
      const text = `✋ ${bold(alert.acknowledgedBy.name, 'telegram')} atiende: ${escapeHtml(`${ALERT_LABELS[alert.kind]} · ${alert.device.name}`)}`;
      for (const group of groups) {
        await this.telegram.sendMessage(group.address, text).catch((error: Error) => {
          this.logger.warn(`Could not announce in group ${group.label}: ${error.message}`);
        });
      }
    } catch (error) {
      this.logger.warn(`Could not announce acknowledgement: ${(error as Error).message}`);
    }
  }

  private async isManager(from: TelegramUser | undefined) {
    if (!from) return false;
    const personal = await this.channels.findChannel('telegram', String(from.id));
    if (!personal?.userId || !personal.active) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: personal.userId },
      select: { active: true, role: { select: { permissions: true } } },
    });
    return Boolean(user?.active && user.role.permissions.includes('alerts.manage'));
  }

  private reply(message: TelegramMessage, html: string) {
    return this.telegram.sendMessage(message.chat.id, html).catch((error: Error) => {
      this.logger.warn(`Could not reply in Telegram: ${error.message}`);
    });
  }
}
