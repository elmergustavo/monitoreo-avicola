import { Controller, Get, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { ReportQueryDto } from './dto/report-query.dto.js';
import { renderExcel } from './renderers/excel.renderer.js';
import { renderPdf } from './renderers/pdf.renderer.js';
import { ReportDataService } from './report-data.service.js';
import { reportFileName } from './report.format.js';

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly data: ReportDataService,
    private readonly audit: AuditService,
  ) {}

  @Get('recent')
  @RequirePermissions('reports.export')
  @ApiOperation({ summary: 'Reports the current user downloaded recently' })
  recent(@CurrentUser() user: AuthenticatedUser) {
    return this.data.recentExports(user.id);
  }

  @Get('operations')
  @RequirePermissions('reports.export')
  // Building a report is expensive: limit how often one person can ask for it.
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiProduces(CONTENT_TYPES.pdf, CONTENT_TYPES.xlsx)
  @ApiOperation({ summary: 'Temperature and irrigation report as PDF or Excel' })
  async operations(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const report = await this.data.build({
      fromDate: query.from,
      toDate: query.to,
      deviceId: query.deviceId,
      requester: { name: user.name, email: user.email },
    });

    const file =
      query.format === 'pdf'
        ? await renderPdf(report)
        : await renderExcel(report, await this.data.readings(report));

    await this.audit.record({
      userId: user.id,
      action: 'report.exported',
      entityType: query.deviceId ? 'device' : undefined,
      entityId: query.deviceId,
      metadata: { code: report.code, format: query.format, from: query.from, to: query.to },
      ip: req.ip,
    });

    const fileName = `${reportFileName(report)}.${query.format}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Report-Code', report.code);
    return new StreamableFile(file, {
      type: CONTENT_TYPES[query.format],
      disposition: `attachment; filename="${fileName}"`,
      length: file.length,
    });
  }
}
