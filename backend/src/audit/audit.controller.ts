import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators.js';
import { AuditService } from './audit.service.js';
import { ListAuditLogsQueryDto } from './list-audit-logs.dto.js';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  @ApiOperation({ summary: 'List audit entries, newest first (cursor: before)' })
  list(@Query() query: ListAuditLogsQueryDto) {
    return this.audit.list({
      limit: query.limit ?? 50,
      before: query.before ? new Date(query.before) : undefined,
      userId: query.userId,
      action: query.action,
    });
  }
}
