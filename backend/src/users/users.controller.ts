import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List users' })
  list() {
    return this.users.list();
  }

  @Get(':id')
  @RequirePermissions('users.read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Create a user; returns a temporary password shown only once' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser, @Req() req: Request) {
    return this.users.create(dto, actor.id, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Update name, role or active status' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.users.update(id, dto, actor.id, req.ip);
  }

  @Post(':id/reset-password')
  @RequirePermissions('users.manage')
  @ApiOperation({ summary: 'Generate a new temporary password (shown only once)' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.users.resetPassword(id, actor.id, req.ip);
  }
}
