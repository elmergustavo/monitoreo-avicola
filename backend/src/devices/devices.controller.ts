import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { UpdateSettingsDto } from '../telemetry/dto/telemetry.dto.js';
import { DevicesService } from './devices.service.js';
import { CreateDeviceDto, UpdateDeviceDto } from './dto/device.dto.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermissions('telemetry.read')
  @ApiOperation({ summary: 'Sheds/devices with settings, last reading and online status' })
  list(@CurrentUser() user: AuthenticatedUser) {
    // Inactive devices are only listed for people who can manage them.
    return this.devices.list(user.permissions.includes('devices.manage'));
  }

  @Get(':id')
  @RequirePermissions('telemetry.read')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.devices.findOne(id, user.permissions.includes('devices.manage'));
  }

  @Post()
  @RequirePermissions('devices.manage')
  @ApiOperation({ summary: 'Register a device; returns its API key (shown only once)' })
  create(
    @Body() dto: CreateDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.devices.create(dto, user.id, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('devices.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.devices.update(id, dto, user.id, req.ip);
  }

  @Post(':id/rotate-key')
  @RequirePermissions('devices.manage')
  @ApiOperation({ summary: 'Generate a new API key (the old one stops working)' })
  rotateKey(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.devices.rotateKey(id, user.id, req.ip);
  }

  @Patch(':id/settings')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Update temperature thresholds (min < max < alert)' })
  updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.devices.updateSettings(id, dto, user.id, req.ip);
  }
}
