import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ChannelsService } from '../notifications/channels.service.js';
import { maskPhone, normalizePhone } from '../notifications/delivery-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FarmCommandsService } from './farm-commands.service.js';

const HELP = [
  'Soy el asistente de monitoreo de *Granjas La Sierra*. Puedes escribir:',
  '',
  '*OK*: atiendes la última alerta que te llegó',
  '*ESTADO*: temperatura y riego de cada galpón',
  '*ALERTAS*: alertas abiertas',
  '*SALIR*: dejar de recibir alertas aquí',
].join('\n');

const NOT_LINKED =
  'Este número no está vinculado. Entra al dashboard → *Mi perfil* → *WhatsApp* para obtener tu código.';

const ACK_WORDS = new Set(['ok', 'okay', 'oki', 'si', 'lo atiendo', 'atiendo', 'voy', 'yo voy']);

/** Lowercase, no accents or punctuation: "Sí!" → "si". */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Replies to WhatsApp messages (via Twilio's webhook). Every message also
 * reopens WhatsApp's 24-hour window for alerts to that number.
 */
@Injectable()
export class WhatsAppInboundService {
  private readonly logger = new Logger(WhatsAppInboundService.name);

  constructor(
    private readonly channels: ChannelsService,
    private readonly commands: FarmCommandsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Returns the reply text. */
  async handle(from: string, text: string): Promise<string> {
    const phone = normalizePhone(from.replace(/^whatsapp:/, ''));
    if (!phone) return HELP;
    const message = normalize(text);

    const link = /^(?:vincular\s+)?(\d{6})$/.exec(message);
    if (link) return this.link(phone, link[1]);

    const channel = await this.channels.findChannel('whatsapp', phone);
    if (!channel?.userId || !channel.active) return NOT_LINKED;
    await this.channels.touchInbound(channel.id);
    if (!(await this.commands.canWatch(channel.userId))) {
      return 'Tu usuario no tiene acceso a los galpones. Habla con el administrador.';
    }

    if (ACK_WORDS.has(message)) return this.acknowledgeLatest(channel.id, channel.userId);
    if (message === 'estado') return this.commands.statusText('whatsapp');
    if (message === 'alertas') {
      const alerts = await this.commands.openAlerts();
      if (alerts.length === 0) return '🟢 No hay alertas abiertas.';
      return [
        ...alerts.map((alert) => this.commands.alertLine(alert, 'whatsapp')),
        '',
        'Responde *OK* para atender la más reciente que te llegó.',
      ].join('\n\n');
    }
    if (message === 'salir' || message === 'desvincular') {
      await this.channels.deactivate('whatsapp', phone);
      return 'Listo: este número ya no recibirá alertas. Puedes volver a vincularlo desde el dashboard.';
    }
    return HELP;
  }

  private async link(phone: string, code: string): Promise<string> {
    const redeemed = await this.channels.redeem(
      code,
      { type: 'whatsapp', isGroup: false, address: phone },
      `wa:${phone}`,
    );
    if (!redeemed.ok) {
      return {
        invalid: 'Ese código no es válido. Genera uno nuevo en el dashboard.',
        expired: 'Ese código ya venció (duran 15 minutos). Genera uno nuevo en el dashboard.',
        wrong_number: 'Ese código se generó para otro número. Revisa el número en el dashboard.',
        too_many_attempts: 'Demasiados intentos. Espera unos minutos.',
      }[redeemed.reason];
    }
    const userId = redeemed.code.userId;
    const channel = await this.channels.linkPersonal(userId, 'whatsapp', phone, maskPhone(phone));
    await this.audit.record({
      userId,
      action: 'notifications.channel_linked',
      entityType: 'notification_channel',
      entityId: channel.id,
      metadata: { type: 'whatsapp', label: channel.label },
    });
    this.logger.log(`WhatsApp linked for user ${userId}`);
    const name = (await this.commands.userName(userId)).split(' ')[0];
    return `✅ Listo, ${name}. Desde ahora recibirás aquí las alertas de los galpones.\n\n${HELP}`;
  }

  /** "OK": takes the most recent open alert that was sent to this number. */
  private async acknowledgeLatest(channelId: string, userId: string): Promise<string> {
    const recent = await this.prisma.notificationDelivery.findMany({
      where: {
        channelId,
        status: 'sent',
        alertId: { not: null },
        kind: { in: ['alert_opened', 'alert_reminder', 'alert_escalated'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { alertId: true },
      take: 20,
    });
    const ids = [...new Set(recent.map((d) => d.alertId!))];
    const candidate = ids.length
      ? await this.prisma.alert.findFirst({
          where: { id: { in: ids }, status: { not: 'resolved' } },
          orderBy: { openedAt: 'desc' },
          select: { id: true },
        })
      : null;
    if (!candidate) return '🟢 No tienes alertas pendientes por atender.';

    const outcome = await this.commands.acknowledge(userId, candidate.id, 'whatsapp');
    switch (outcome.result) {
      case 'acknowledged':
        return `✋ Listo: quedó registrado que tú atiendes *${outcome.alert.label} · ${outcome.alert.device.name}*.`;
      case 'already':
        return `Esa alerta ya la atiende ${outcome.by}: *${outcome.alert.label} · ${outcome.alert.device.name}*.`;
      case 'resolved':
        return '🟢 Esa alerta ya se resolvió.';
      default:
        return 'No se pudo registrar. Intenta desde el dashboard.';
    }
  }
}
