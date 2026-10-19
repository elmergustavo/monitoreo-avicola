import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';
import { DevicesController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, ApiKeyGuard],
  exports: [DevicesService, ApiKeyGuard],
})
export class DevicesModule {}
