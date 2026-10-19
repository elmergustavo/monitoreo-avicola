import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Records an action. Failures are logged but never break the request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata,
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.error(`Could not write audit log "${entry.action}"`, error as Error);
    }
  }

  async list(params: { limit: number; before?: Date; userId?: string; action?: string }) {
    const items = await this.prisma.auditLog.findMany({
      where: {
        createdAt: params.before ? { lt: params.before } : undefined,
        userId: params.userId,
        action: params.action ? { startsWith: params.action } : undefined,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    });
    return items.map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entityType,
      entityId: item.entityId,
      metadata: item.metadata,
      ip: item.ip,
      createdAt: item.createdAt,
      user: item.user,
    }));
  }
}
