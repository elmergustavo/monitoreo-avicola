import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { DailySummaryService } from './daily-summary.service.js';
import { FarmCommandsService } from './farm-commands.service.js';
import { MessagingController } from './messaging.controller.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { WhatsAppInboundService } from './whatsapp-inbound.service.js';

/** Conversations with people on Telegram and WhatsApp, and the daily summary. */
@Module({
  imports: [AlertsModule, DevicesModule, ReportsModule],
  controllers: [MessagingController],
  providers: [FarmCommandsService, TelegramBotService, WhatsAppInboundService, DailySummaryService],
  exports: [TelegramBotService, WhatsAppInboundService, DailySummaryService],
})
export class MessagingModule {}
