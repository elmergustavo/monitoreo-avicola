import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { DevicesService } from '../devices/devices.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlertsService } from './alerts.service.js';
import { AlertsQueryDto, UpdateAlertRulesDto } from './dto/alerts.dto.js';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller()
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly devices: DevicesService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('alerts')
  @RequirePermissions('telemetry.read')
  @ApiOperation({ summary: 'Alerts, newest first (status=active for the open ones)' })
  list(@Query() query: AlertsQueryDto) {
    return this.alerts.list({
      status: query.status,
      deviceId: query.deviceId,
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit ?? 50,
    });
  }

  @Get('alerts/:id')
  @RequirePermissions('telemetry.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.alerts.findOne(id);
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(200)
  @RequirePermissions('telemetry.read')
  @ApiOperation({ summary: '"Lo atiendo": stops reminders and escalation' })
  async acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const alert = await this.alerts.acknowledge(id, user.id);
    await this.audit.record({
      userId: user.id,
      action: 'alert.acknowledged',
      entityType: 'alert',
      entityId: id,
      metadata: { kind: alert.kind, device: alert.device.name },
      ip: req.ip,
    });
    return alert;
  }

  @Post('alerts/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('alerts.manage')
  @ApiOperation({ summary: 'Close an alert by hand' })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const alert = await this.alerts.resolveById(id, user.id, user.name);
    await this.audit.record({
      userId: user.id,
      action: 'alert.resolved',
      entityType: 'alert',
      entityId: id,
      metadata: { kind: alert.kind, device: alert.device.name },
      ip: req.ip,
    });
    return alert;
  }

  @Patch('devices/:id/alert-rules')
  @RequirePermissions('alerts.manage')
  @ApiOperation({ summary: 'Alert timings of a shed (minutes)' })
  async updateRules(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlertRulesDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const before = await this.devices.findOne(id);
    await this.prisma.deviceSettings.upsert({
      where: { deviceId: id },
      update: dto,
      create: { deviceId: id, ...before.settings, ...dto },
    });
    await this.audit.record({
      userId: user.id,
      action: 'device.alert_rules_updated',
      entityType: 'device',
      entityId: id,
      metadata: { before: { ...before.alertRules }, after: { ...dto } },
      ip: req.ip,
    });
    return this.devices.findOne(id);
  }
}
