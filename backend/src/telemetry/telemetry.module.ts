import { Global, Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { TelemetryStreamService } from './telemetry-stream.service.js';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryService } from './telemetry.service.js';

@Global()
@Module({
  imports: [DevicesModule],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryStreamService],
  exports: [TelemetryStreamService],
})
export class TelemetryModule {}
