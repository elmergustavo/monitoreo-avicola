import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service.js';
import { generateSecret, sha256 } from '../common/token.util.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessTokenPayload, AuthenticatedUser } from './auth.types.js';
import { hashPassword, verifyPassword } from './password.util.js';
import { isPermission } from './permissions.js';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a replaced refresh token is still accepted. */
const REFRESH_GRACE_MS = 2 * 60_000;

@Injectable()
export class AuthService {
  /** Verified when the email does not exist, so both paths take the same time. */
  private readonly dummyHash = hashPassword(generateSecret());

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, client: ClientInfo): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = await verifyPassword(user?.passwordHash ?? (await this.dummyHash), password);

    if (!user || !valid || !user.active) {
      await this.audit.record({
        userId: user?.id,
        action: 'auth.login_failed',
        metadata: {
          email,
          reason: !user ? 'unknown_email' : !user.active ? 'inactive' : 'wrong_password',
        },
        ip: client.ip,
      });
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    const refreshToken = generateSecret();
    const refreshTokenExpiresAt = new Date(Date.now() + this.refreshTtlDays() * DAY_MS);
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshTokenExpiresAt,
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 255),
      },
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ userId: user.id, action: 'auth.login', ip: client.ip });

    return {
      ...(await this.signAccessToken(user.id, session.id)),
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  /**
   * Rotates the refresh token. The replaced token keeps working for a short
   * grace period: if the response with the new token is lost (page reload,
   * weak mobile signal), the browser still holds the old one and must not be
   * signed out for it.
   */
  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const hash = sha256(refreshToken);
    const graceStart = new Date(Date.now() - REFRESH_GRACE_MS);
    const session = await this.prisma.session.findFirst({
      where: {
        OR: [{ tokenHash: hash }, { previousTokenHash: hash, rotatedAt: { gt: graceStart } }],
      },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) {
      throw new UnauthorizedException('Session expired');
    }

    const nextToken = generateSecret();
    const refreshTokenExpiresAt = new Date(Date.now() + this.refreshTtlDays() * DAY_MS);
    const now = new Date();
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        tokenHash: sha256(nextToken),
        previousTokenHash: session.tokenHash,
        rotatedAt: now,
        expiresAt: refreshTokenExpiresAt,
        lastUsedAt: now,
      },
    });

    return {
      ...(await this.signAccessToken(session.userId, session.id)),
      refreshToken: nextToken,
      refreshTokenExpiresAt,
    };
  }

  async logout(sessionId: string, userId: string, client: ClientInfo): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({ userId, action: 'auth.logout', ip: client.ip });
  }

  async changePassword(
    user: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
    client: ClientInfo,
  ) {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(record.passwordHash, currentPassword))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta a la actual');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
      }),
      // Sign out every other device; keep the current session.
      this.prisma.session.updateMany({
        where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({ userId: user.id, action: 'auth.password_changed', ip: client.ip });
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      role: { id: user.role.id, key: user.role.key, name: user.role.name },
      permissions: user.role.permissions.filter(isPermission),
    };
  }

  private async signAccessToken(userId: string, sessionId: string) {
    const expiresIn = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId };
    return {
      accessToken: await this.jwt.signAsync(payload, { expiresIn }),
      accessTokenExpiresIn: expiresIn,
    };
  }

  private refreshTtlDays(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }
}
