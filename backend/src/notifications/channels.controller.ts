import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { ChannelsService } from './channels.service.js';
import { TelegramClient } from './channels/telegram.client.js';
import { TwilioClient } from './channels/twilio.client.js';
import { DeliveryService } from './delivery.service.js';
import { DeliveriesQueryDto, UpdatePreferencesDto, WhatsAppLinkDto } from './dto/channels.dto.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Telegram / WhatsApp links and preferences. Personal settings need only a
 * session; the farm's groups and the delivery log need alerts.manage.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class ChannelsController {
  constructor(
    private readonly channels: ChannelsService,
    private readonly deliveries: DeliveryService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramClient,
    private readonly twilio: TwilioClient,
    private readonly audit: AuditService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'My channels, preferences and which providers are configured' })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.channels.settings(user.id);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePreferencesDto) {
    return this.channels.updatePreferences(user.id, dto);
  }

  @Post('channels/telegram/link')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'One-time code and t.me link to connect my Telegram' })
  async linkTelegram(@CurrentUser() user: AuthenticatedUser) {
    const username = await this.requireTelegram();
    const { code, expiresAt } = await this.channels.createLinkCode(user.id, 'telegram');
    return {
      code,
      expiresAt,
      url: `https://t.me/${username}?start=${code}`,
      botUsername: username,
    };
  }

  @Post('channels/whatsapp/link')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'One-time code to send from my WhatsApp number' })
  async linkWhatsApp(@CurrentUser() user: AuthenticatedUser, @Body() dto: WhatsAppLinkDto) {
    this.requireWhatsApp();
    const { code, expiresAt, phone } = await this.channels.createLinkCode(user.id, 'whatsapp', {
      phone: dto.phone,
    });
    const number = this.twilio.senderNumber;
    const message = `VINCULAR ${code}`;
    return {
      code,
      expiresAt,
      phone,
      number,
      message,
      sandboxJoinCode: this.twilio.sandboxJoinCode ?? null,
      url: `https://wa.me/${number.replace('+', '')}?text=${encodeURIComponent(message)}`,
    };
  }

  @Delete('channels/:id')
  @HttpCode(204)
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.channels.unlinkOwn(user.id, id);
    await this.audit.record({
      userId: user.id,
      action: 'notifications.channel_unlinked',
      entityType: 'notification_channel',
      entityId: id,
      ip: req.ip,
    });
  }

  @Post('test')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sends a test message to my inbox and every linked chat' })
  async test(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.notifications.send([user.id], {
      kind: 'test',
      title: 'Prueba de notificaciones',
      body: `Hola ${user.name.split(' ')[0]}: si lees esto, las alertas de los galpones te llegarán por aquí.`,
    });
    return { channels: result.deliveries };
  }

  // --- Farm groups and delivery log ---

  @Get('groups')
  @RequirePermissions('alerts.manage')
  groups() {
    return this.channels.groups();
  }

  @Post('groups/link')
  @RequirePermissions('alerts.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Code to write in a Telegram group: /vincular <code>' })
  async linkGroup(@CurrentUser() user: AuthenticatedUser) {
    const username = await this.requireTelegram();
    const { code, expiresAt } = await this.channels.createLinkCode(user.id, 'telegram', {
      isGroup: true,
    });
    return {
      code,
      expiresAt,
      botUsername: username,
      command: `/vincular ${code}`,
      // Opens Telegram's "add to group" picker with the bot preselected.
      addToGroupUrl: `https://t.me/${username}?startgroup=${code}`,
    };
  }

  @Delete('groups/:id')
  @HttpCode(204)
  @RequirePermissions('alerts.manage')
  async unlinkGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const group = await this.channels.unlinkGroup(id);
    await this.audit.record({
      userId: user.id,
      action: 'notifications.group_unlinked',
      entityType: 'notification_channel',
      entityId: id,
      metadata: { title: group.label },
      ip: req.ip,
    });
  }

  @Get('deliveries')
  @RequirePermissions('alerts.manage')
  @ApiOperation({ summary: 'Messages sent to Telegram and WhatsApp, newest first' })
  listDeliveries(@Query() query: DeliveriesQueryDto) {
    return this.deliveries.list({
      status: query.status,
      type: query.type,
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit ?? 50,
    });
  }

  @Post('deliveries/:id/retry')
  @HttpCode(204)
  @RequirePermissions('alerts.manage')
  async retryDelivery(@Param('id', ParseUUIDPipe) id: string) {
    await this.deliveries.retry(id);
  }

  private async requireTelegram(): Promise<string> {
    const username = this.telegram.configured ? await this.telegram.botUsername() : null;
    if (!username) {
      throw new ServiceUnavailableException('Telegram no está configurado en el servidor');
    }
    return username;
  }

  private requireWhatsApp() {
    if (!this.twilio.configured) {
      throw new ServiceUnavailableException('WhatsApp no está configurado en el servidor');
    }
  }
}
