import { Injectable } from '@nestjs/common';
import { toNumber } from '../common/decimal.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReadingDto } from './dto/create-reading.dto.js';
import { ReadingResponseDto } from './dto/reading-response.dto.js';

@Injectable()
export class ReadingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(deviceId: string, dto: CreateReadingDto): Promise<ReadingResponseDto> {
    // createdAt is always set by the database, never by the device.
    const reading = await this.prisma.reading.create({
      data: {
        deviceId,
        temperature: dto.temperature,
        humidity: dto.humidity ?? null,
        irrigation: dto.irrigation,
      },
    });

    return {
      id: reading.id,
      temperature: toNumber(reading.temperature),
      humidity: toNumber(reading.humidity),
      irrigation: reading.irrigation,
      createdAt: reading.createdAt,
    };
  }
}
