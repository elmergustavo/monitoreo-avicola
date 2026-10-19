import { Controller, Get, MessageEvent, Param, ParseUUIDPipe, Query, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { interval, map, merge, type Observable } from 'rxjs';
import { RequirePermissions } from '../auth/decorators.js';
import { EventsQueryDto, ReadingsQueryDto } from './dto/telemetry.dto.js';
import { TelemetryStreamService } from './telemetry-stream.service.js';
import { TelemetryService } from './telemetry.service.js';

/** Keeps idle connections open through proxies (Traefik, Cloudflare). */
const HEARTBEAT_MS = 25_000;

@ApiTags('telemetry')
@ApiBearerAuth()
@RequirePermissions('telemetry.read')
@Controller()
export class TelemetryController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly stream: TelemetryStreamService,
  ) {}

  @Get('devices/:id/readings')
  @ApiOperation({ summary: 'Readings in a time range (raw up to 24 h, averaged buckets beyond)' })
  readings(@Param('id', ParseUUIDPipe) id: string, @Query() query: ReadingsQueryDto) {
    return this.telemetry.readings(id, query.from, query.to);
  }

  @Get('devices/:id/events')
  @ApiOperation({ summary: 'Events, newest first (cursor: before)' })
  events(@Param('id', ParseUUIDPipe) id: string, @Query() query: EventsQueryDto) {
    return this.telemetry.events(id, query);
  }

  @Get('devices/:id/summary')
  @ApiOperation({ summary: "Today's summary in Guatemala time" })
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.telemetry.summary(id);
  }

  @Sse('stream')
  @SkipThrottle()
  @ApiProduces('text/event-stream')
  @ApiOperation({ summary: 'Live readings and events (server-sent events: reading, event, ping)' })
  live(): Observable<MessageEvent> {
    const messages = this.stream.messages$.pipe(
      map(({ type, ...data }): MessageEvent => ({ type, data })),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(messages, heartbeat);
  }
}
