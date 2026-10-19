import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser, RequirePermissions } from '../auth/decorators.js';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';
import { RolesService } from './roles.service.js';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List roles with their permissions and user count' })
  list() {
    return this.roles.list();
  }

  @Get('permissions')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Permission catalog' })
  permissions() {
    return this.roles.permissionCatalog();
  }

  @Post()
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Create a custom role' })
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.roles.create(dto, user.id, req.ip);
  }

  @Patch(':id')
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Update a role (the admin role is locked)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.roles.update(id, dto, user.id, req.ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('roles.manage')
  @ApiOperation({ summary: 'Delete a custom role without users' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.roles.remove(id, user.id, req.ip);
  }
}
