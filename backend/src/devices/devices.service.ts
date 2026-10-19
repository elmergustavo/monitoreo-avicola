import { Injectable } from '@nestjs/common';
import type { Device } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashApiKey } from './api-key.util.js';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the active device that owns the given API key, if any. */
  findActiveByApiKey(apiKey: string): Promise<Device | null> {
    return this.prisma.device.findFirst({
      where: { apiKeyHash: hashApiKey(apiKey), active: true },
    });
  }
}
