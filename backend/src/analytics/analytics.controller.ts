import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators.js';
import { AnalyticsQueryDto } from './analytics.dto.js';
import { AnalyticsService } from './analytics.service.js';

/** Data for the "Análisis" page, one endpoint per chart so each loads on its own. */
@ApiTags('analytics')
@ApiBearerAuth()
@RequirePermissions('telemetry.read')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Headline numbers, against the previous period of the same length' })
  summary(@Query() q: AnalyticsQueryDto) {
    return this.analytics.summary(q.deviceId, q.from, q.to);
  }

  @Get('series')
  @ApiOperation({ summary: 'Averaged temperature with min/max, irrigation spans and alerts' })
  series(@Query() q: AnalyticsQueryDto) {
    return this.analytics.series(q.deviceId, q.from, q.to);
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Average temperature per hour and day' })
  heatmap(@Query() q: AnalyticsQueryDto) {
    return this.analytics.heatmap(q.deviceId, q.from, q.to);
  }

  @Get('ranges')
  @ApiOperation({ summary: 'Share of each day cold, optimal, warm and at alert level' })
  ranges(@Query() q: AnalyticsQueryDto) {
    return this.analytics.ranges(q.deviceId, q.from, q.to);
  }

  @Get('irrigation')
  @ApiOperation({ summary: 'Temperature response to each irrigation cycle' })
  irrigation(@Query() q: AnalyticsQueryDto) {
    return this.analytics.irrigation(q.deviceId, q.from, q.to);
  }

  @Get('compare')
  @ApiOperation({ summary: 'Last day vs. the day before, the 7-day average and other sheds' })
  compare(@Query() q: AnalyticsQueryDto) {
    return this.analytics.compare(q.deviceId, q.from, q.to);
  }
}
