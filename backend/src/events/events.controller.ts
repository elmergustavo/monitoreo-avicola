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
import { CreateEventDto } from './dto/create-event.dto.js';
import { EventResponseDto } from './dto/event-response.dto.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@ApiSecurity(API_KEY_SECURITY_NAME)
@Public() // devices authenticate with x-api-key, not a user token
@UseGuards(ApiKeyGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Store an event sent by the ESP32 (e.g. irrigation turned on/off)' })
  @ApiCreatedResponse({ type: EventResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid API key' })
  create(@CurrentDevice() device: Device, @Body() dto: CreateEventDto): Promise<EventResponseDto> {
    return this.eventsService.create(device.id, dto);
  }
}
