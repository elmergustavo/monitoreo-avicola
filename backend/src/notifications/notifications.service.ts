import { Injectable, NotFoundException } from '@nestjs/common';
import type { Permission } from '../auth/permissions.js';
import type { AlertSeverity, NotificationKind } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelemetryStreamService } from '../telemetry/telemetry-stream.service.js';
import { DeliveryService, type DailyReportAttachment } from './delivery.service.js';

export interface NewNotification {
  kind: NotificationKind;
  title: string;
  body: string;
  severity?: AlertSeverity | null;
  alertId?: string | null;
  /** Shed the notification is about (lets the dashboard link to it). */
  deviceId?: string | null;
  /** Severity of the alert behind it; decides quiet hours and "critical only". */
  alertSeverity?: AlertSeverity | null;
  /** Also post it in the linked Telegram groups. */
  toGroups?: boolean;
  attachment?: DailyReportAttachment | null;
}

/**
 * Users' inboxes. Every inbox entry is also queued for the person's Telegram
 * and WhatsApp, following their preferences.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stream: TelemetryStreamService,
    private readonly deliveries: DeliveryService,
  ) {}

  /** Active users whose role has the given permission. */
  async recipientsWith(permission: Permission): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { active: true, role: { permissions: { has: permission } } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  /**
   * Writes one inbox entry per user, pushes it to their open dashboards and
   * queues it for their channels (and the groups, if asked).
   */
  async send(
    userIds: string[],
    notification: NewNotification,
  ): Promise<{ inbox: number; deliveries: number }> {
    const unique = [...new Set(userIds)];
    const groupDeliveries = notification.toGroups
      ? await this.deliveries.enqueueForGroups(notification)
      : 0;
    if (unique.length === 0) return { inbox: 0, deliveries: groupDeliveries };
    const created = await this.prisma.notification.createManyAndReturn({
      data: unique.map((userId) => ({
        userId,
        kind: notification.kind,
        title: notification.title,
        body: notification.body,
        severity: notification.severity ?? null,
        alertId: notification.alertId ?? null,
      })),
    });
    for (const entry of created) {
      this.stream.publish({
        type: 'notification',
        userId: entry.userId,
        notification: {
          id: entry.id,
          kind: entry.kind,
          severity: entry.severity,
          title: entry.title,
          body: entry.body,
          alertId: entry.alertId,
          deviceId: notification.deviceId ?? null,
          createdAt: entry.createdAt,
        },
      });
    }
    const personal = await this.deliveries.enqueueForUsers(created, notification);
    return { inbox: created.length, deliveries: personal + groupDeliveries };
  }

  async list(userId: string, params: { before?: Date; limit: number; unreadOnly?: boolean }) {
    const items = await this.prisma.notification.findMany({
      where: {
        userId,
        createdAt: params.before ? { lt: params.before } : undefined,
        readAt: params.unreadOnly ? null : undefined,
      },
      include: { alert: { select: { status: true, deviceId: true } } },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    });
    return items.map(({ alert, userId: _userId, ...item }) => ({
      ...item,
      alertStatus: alert?.status ?? null,
      deviceId: alert?.deviceId ?? null,
    }));
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.notification.count({ where: { id, userId } });
      if (!exists) throw new NotFoundException('Notificación no encontrada');
    }
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
