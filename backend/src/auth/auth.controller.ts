import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { NodeEnv } from '../config/env.validation.js';
import { AuthService, type ClientInfo, type IssuedTokens } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { AllowPendingPasswordChange, CurrentUser, Public } from './decorators.js';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto.js';

export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in with email and password (sets the refresh cookie)' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(dto.email, dto.password, clientInfo(req));
    return this.respondWithTokens(res, tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get a new access token using the refresh cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Session expired');
    // A failed refresh does not clear the cookie: another tab may have just
    // rotated it, and clearing it here would sign that tab out too.
    return this.respondWithTokens(res, await this.auth.refresh(token));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Close the current session' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.sessionId, user.id, clientInfo(req));
    this.clearRefreshCookie(res);
  }

  @Get('me')
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user, role and permissions' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.profile(user.id);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change own password (signs out other sessions)' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(user, dto.currentPassword, dto.newPassword, clientInfo(req));
  }

  private respondWithTokens(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === NodeEnv.Production,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: tokens.refreshTokenExpiresAt,
    });
    return { accessToken: tokens.accessToken, expiresIn: tokens.accessTokenExpiresIn };
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }
}

export function clientInfo(req: Request): ClientInfo {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}
