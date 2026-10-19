import { Module } from '@nestjs/common';
import { ReportDataService } from './report-data.service.js';
import { ReportsController } from './reports.controller.js';

@Module({
  controllers: [ReportsController],
  providers: [ReportDataService],
  exports: [ReportDataService],
})
export class ReportsModule {}
