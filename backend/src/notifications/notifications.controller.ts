import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators.js';
import { NotificationsQueryDto } from './dto/notifications-query.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Every signed-in user has an inbox; no extra permission needed. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Current user's notifications, newest first" })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: NotificationsQueryDto) {
    return this.notifications.list(user.id, {
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit ?? 30,
      unreadOnly: query.unread,
    });
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(user.id, id);
  }
}
