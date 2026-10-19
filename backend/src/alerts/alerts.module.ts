import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { AlertEngineService } from './alert-engine.service.js';
import { AlertsController } from './alerts.controller.js';
import { AlertsService } from './alerts.service.js';

@Module({
  imports: [DevicesModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertEngineService],
  exports: [AlertsService, AlertEngineService],
})
export class AlertsModule {}
