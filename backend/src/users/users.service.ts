import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { generateTemporaryPassword, hashPassword } from '../auth/password.util.js';
import { ADMIN_ROLE_KEY } from '../auth/permissions.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';

const userSelect = {
  id: true,
  email: true,
  name: true,
  active: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, key: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.user.findMany({
      select: userSelect,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Creates the user with a temporary password that must be changed on first login. */
  async create(dto: CreateUserDto, actorId: string | null, ip?: string) {
    await this.ensureRoleExists(dto.roleId);
    const temporaryPassword = generateTemporaryPassword();

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name.trim(),
          roleId: dto.roleId,
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        },
        select: userSelect,
      });
      await this.audit.record({
        userId: actorId,
        action: 'user.created',
        entityType: 'user',
        entityId: user.id,
        metadata: { email: user.email, role: user.role.key },
        ip,
      });
      return { user, temporaryPassword };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId: string | null, ip?: string) {
    const current = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!current) throw new NotFoundException('Usuario no encontrado');

    if (id === actorId && (dto.active === false || (dto.roleId && dto.roleId !== current.roleId))) {
      throw new BadRequestException('No puedes cambiar tu propio rol ni desactivar tu cuenta');
    }

    const nextRole = dto.roleId ? await this.ensureRoleExists(dto.roleId) : current.role;
    const losesAdmin =
      current.role.key === ADMIN_ROLE_KEY &&
      current.active &&
      (nextRole.key !== ADMIN_ROLE_KEY || dto.active === false);
    if (losesAdmin) await this.ensureAnotherActiveAdmin(id);

    const deactivated = current.active && dto.active === false;
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name: dto.name?.trim(), roleId: dto.roleId, active: dto.active },
        select: userSelect,
      });
      // A deactivated user is signed out everywhere.
      if (deactivated) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });

    await this.audit.record({
      userId: actorId,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      metadata: {
        changes: { ...dto },
        before: { name: current.name, role: current.role.key, active: current.active },
      },
      ip,
    });
    return user;
  }

  /** Generates a new temporary password and signs the user out everywhere. */
  async resetPassword(id: string, actorId: string | null, ip?: string) {
    await this.findOne(id);
    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
      }),
      this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      userId: actorId,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: id,
      ip,
    });
    return { temporaryPassword };
  }

  /**
   * Deletes a user for good. Their sessions, inbox, Telegram/WhatsApp links and
   * preferences go with them; the audit log and the alerts they attended keep
   * the record without the person (the foreign keys set it to null).
   */
  async remove(id: string, actorId: string | null, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (id === actorId) throw new BadRequestException('No puedes eliminar tu propia cuenta');
    if (user.role.key === ADMIN_ROLE_KEY && user.active) await this.ensureAnotherActiveAdmin(id);

    await this.prisma.user.delete({ where: { id } });
    await this.audit.record({
      userId: actorId,
      action: 'user.deleted',
      entityType: 'user',
      entityId: id,
      metadata: { email: user.email, name: user.name, role: user.role.key },
      ip,
    });
    return { email: user.email, name: user.name, role: user.role.name };
  }

  private async ensureRoleExists(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException('El rol no existe');
    return role;
  }

  private async ensureAnotherActiveAdmin(excludeUserId: string) {
    const admins = await this.prisma.user.count({
      where: { id: { not: excludeUserId }, active: true, role: { key: ADMIN_ROLE_KEY } },
    });
    if (admins === 0) throw new BadRequestException('Debe quedar al menos un administrador activo');
  }
}
