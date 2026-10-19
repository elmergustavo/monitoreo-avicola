import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  imports: [ReportsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
