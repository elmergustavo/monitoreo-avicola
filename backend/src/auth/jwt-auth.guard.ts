import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessTokenPayload, UserRequest } from './auth.types.js';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from './decorators.js';
import { isPermission } from './permissions.js';

/**
 * Global guard: every route requires a valid access token unless it is
 * marked @Public(). The session is checked on each request so logout,
 * deactivation and role changes take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<UserRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing access token');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { include: { role: true } } },
    });
    const now = new Date();
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !session.user.active
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const { user } = session;
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      sessionId: session.id,
      mustChangePassword: user.mustChangePassword,
      role: { id: user.role.id, key: user.role.key, name: user.role.name },
      permissions: user.role.permissions.filter(isPermission),
    };

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_KEY,
      targets,
    );
    if (user.mustChangePassword && !allowPending) {
      throw new ForbiddenException({
        message: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    return true;
  }

  private extractToken(request: UserRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }
}
