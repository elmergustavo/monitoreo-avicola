import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { ReadingsController } from './readings.controller.js';
import { ReadingsService } from './readings.service.js';

@Module({
  imports: [DevicesModule],
  controllers: [ReadingsController],
  providers: [ReadingsService],
})
export class ReadingsModule {}
