import { Injectable } from '@nestjs/common';
import { toNumber } from '../common/decimal.util.js';
import { DevicesService } from '../devices/devices.service.js';
import { TelemetryStreamService } from '../telemetry/telemetry-stream.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventResponseDto } from './dto/event-response.dto.js';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DevicesService,
    private readonly stream: TelemetryStreamService,
  ) {}

  async create(deviceId: string, dto: CreateEventDto): Promise<EventResponseDto> {
    // createdAt is always set by the database, never by the device.
    const event = await this.prisma.event.create({
      data: {
        deviceId,
        type: dto.type,
        temperature: dto.temperature ?? null,
        durationMin: dto.durationMin ?? null,
      },
    });

    const view = {
      id: event.id,
      type: event.type,
      temperature: toNumber(event.temperature),
      durationMin: toNumber(event.durationMin),
      createdAt: event.createdAt,
    };
    await this.devices.markSeen(deviceId, event.createdAt);
    this.stream.publish({ type: 'event', deviceId, event: view });
    return view;
  }
}
