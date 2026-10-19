import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators.js';
import type { Device } from '../generated/prisma/client.js';
import { ApiKeyGuard } from '../devices/api-key.guard.js';
import { API_KEY_SECURITY_NAME } from '../devices/api-key.util.js';
import { CurrentDevice } from '../devices/current-device.decorator.js';
import { CreateReadingDto } from './dto/create-reading.dto.js';
import { ReadingResponseDto } from './dto/reading-response.dto.js';
import { ReadingsService } from './readings.service.js';

@ApiTags('readings')
@ApiSecurity(API_KEY_SECURITY_NAME)
@Public() // devices authenticate with x-api-key, not a user token
@UseGuards(ApiKeyGuard)
@Controller('readings')
export class ReadingsController {
  constructor(private readonly readingsService: ReadingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Store a reading sent by the ESP32 (every 30 seconds)' })
  @ApiCreatedResponse({ type: ReadingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  create(
    @CurrentDevice() device: Device,
    @Body() dto: CreateReadingDto,
  ): Promise<ReadingResponseDto> {
    return this.readingsService.create(device.id, dto);
  }
}
