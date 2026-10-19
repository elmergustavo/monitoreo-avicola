import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';
import { DevicesService } from './devices.service.js';

@Module({
  providers: [DevicesService, ApiKeyGuard],
  exports: [DevicesService, ApiKeyGuard],
})
export class DevicesModule {}
