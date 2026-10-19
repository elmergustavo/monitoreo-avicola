import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  imports: [DevicesModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
