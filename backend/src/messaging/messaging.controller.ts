import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators.js';
import type { TelegramUpdate } from '../notifications/channels/telegram.client.js';
import { TwilioClient } from '../notifications/channels/twilio.client.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { WhatsAppInboundService } from './whatsapp-inbound.service.js';

const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Webhooks called by Telegram and Twilio. Public, but each one checks a
 * secret (Telegram) or a signature (Twilio) before doing anything.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller()
export class MessagingController {
  constructor(
    private readonly telegramBot: TelegramBotService,
    private readonly whatsapp: WhatsAppInboundService,
    private readonly twilio: TwilioClient,
  ) {}

  @Post('telegram/webhook')
  @HttpCode(200)
  async telegramWebhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
  ) {
    if (!this.telegramBot.verifyWebhookSecret(secret)) throw new ForbiddenException();
    // Answer Telegram right away; it retries slow webhooks.
    void this.telegramBot.handleUpdate(update);
    return { ok: true };
  }

  @Post('whatsapp/webhook')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async whatsappWebhook(
    @Body() params: Record<string, string>,
    @Headers('x-twilio-signature') signature: string | undefined,
  ) {
    if (!this.twilio.validateSignature(signature, params)) throw new ForbiddenException();
    const reply = await this.whatsapp.handle(params.From ?? '', params.Body ?? '');
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(reply)}</Message></Response>`;
  }
}
