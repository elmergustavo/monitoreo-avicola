import { Global, Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { TelegramClient } from './channels/telegram.client.js';
import { TwilioClient } from './channels/twilio.client.js';
import { DeliveryService } from './delivery.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/** Inbox, Telegram/WhatsApp links and the outbox that delivers to them. */
@Global()
@Module({
  imports: [ReportsModule],
  controllers: [ChannelsController, NotificationsController],
  providers: [NotificationsService, DeliveryService, ChannelsService, TelegramClient, TwilioClient],
  exports: [NotificationsService, DeliveryService, ChannelsService, TelegramClient, TwilioClient],
})
export class NotificationsModule {}
