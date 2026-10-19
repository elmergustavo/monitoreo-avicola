import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { toNumber } from '../common/decimal.util.js';
import type { Device, DeviceSettings } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateSettingsDto } from '../telemetry/dto/telemetry.dto.js';
import { generateApiKey, hashApiKey } from './api-key.util.js';
import type { CreateDeviceDto, UpdateDeviceDto } from './dto/device.dto.js';

/** A device is shown as online if it reported within this window (it sends every 30 s). */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export const DEFAULT_SETTINGS = { tempMin: 27, tempMax: 30, tempAlert: 32 };

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Returns the active device that owns the given API key, if any. */
  findActiveByApiKey(apiKey: string): Promise<Device | null> {
    return this.prisma.device.findFirst({
      where: { apiKeyHash: hashApiKey(apiKey), active: true },
    });
  }

  markSeen(deviceId: string, at: Date) {
    return this.prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: at } });
  }

  async list(includeInactive: boolean) {
    const devices = await this.prisma.device.findMany({
      where: includeInactive ? undefined : { active: true },
      include: { settings: true },
      orderBy: { name: 'asc' },
    });
    return Promise.all(devices.map((device) => this.toView(device)));
  }

  async findOne(id: string, includeInactive = true) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: { settings: true },
    });
    if (!device || (!includeInactive && !device.active))
      throw new NotFoundException('Galpón no encontrado');
    return this.toView(device);
  }

  /** Registers a device and returns its API key. The key is shown only once. */
  async create(dto: CreateDeviceDto, actorId: string | null, ip?: string) {
    const apiKey = generateApiKey();
    const device = await this.prisma.device.create({
      data: {
        name: dto.name.trim(),
        shed: dto.shed.trim(),
        apiKeyHash: hashApiKey(apiKey),
        settings: { create: {} },
      },
      include: { settings: true },
    });
    await this.audit.record({
      userId: actorId,
      action: 'device.created',
      entityType: 'device',
      entityId: device.id,
      metadata: { name: device.name, shed: device.shed },
      ip,
    });
    return { device: await this.toView(device), apiKey };
  }

  async update(id: string, dto: UpdateDeviceDto, actorId: string | null, ip?: string) {
    const before = await this.findOne(id);
    await this.prisma.device.update({
      where: { id },
      data: { name: dto.name?.trim(), shed: dto.shed?.trim(), active: dto.active },
    });
    await this.audit.record({
      userId: actorId,
      action: 'device.updated',
      entityType: 'device',
      entityId: id,
      metadata: {
        changes: { ...dto },
        before: { name: before.name, shed: before.shed, active: before.active },
      },
      ip,
    });
    return this.findOne(id);
  }

  /** Replaces the API key; the old one stops working immediately. */
  async rotateKey(id: string, actorId: string | null, ip?: string) {
    await this.findOne(id);
    const apiKey = generateApiKey();
    await this.prisma.device.update({ where: { id }, data: { apiKeyHash: hashApiKey(apiKey) } });
    await this.audit.record({
      userId: actorId,
      action: 'device.key_rotated',
      entityType: 'device',
      entityId: id,
      ip,
    });
    return { apiKey };
  }

  async updateSettings(id: string, dto: UpdateSettingsDto, actorId: string | null, ip?: string) {
    if (!(dto.tempMin < dto.tempMax && dto.tempMax < dto.tempAlert)) {
      throw new BadRequestException('Los valores deben cumplir: mínima < máxima < alerta');
    }
    const before = await this.findOne(id);
    await this.prisma.deviceSettings.upsert({
      where: { deviceId: id },
      update: dto,
      create: { deviceId: id, ...dto },
    });
    await this.audit.record({
      userId: actorId,
      action: 'device.settings_updated',
      entityType: 'device',
      entityId: id,
      metadata: { before: before.settings, after: { ...dto } },
      ip,
    });
    return this.findOne(id);
  }

  private async toView(device: Device & { settings: DeviceSettings | null }) {
    const lastReading = await this.prisma.reading.findFirst({
      where: { deviceId: device.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      id: device.id,
      name: device.name,
      shed: device.shed,
      active: device.active,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      online:
        device.lastSeenAt !== null && Date.now() - device.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
      settings: device.settings
        ? {
            tempMin: toNumber(device.settings.tempMin),
            tempMax: toNumber(device.settings.tempMax),
            tempAlert: toNumber(device.settings.tempAlert),
          }
        : DEFAULT_SETTINGS,
      lastReading: lastReading
        ? {
            temperature: toNumber(lastReading.temperature),
            humidity: toNumber(lastReading.humidity),
            irrigation: lastReading.irrigation,
            createdAt: lastReading.createdAt,
          }
        : null,
    };
  }
}
