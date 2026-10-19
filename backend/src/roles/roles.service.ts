import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ADMIN_ROLE_KEY, isPermission, PERMISSIONS } from '../auth/permissions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  permissionCatalog() {
    return PERMISSIONS;
  }

  async list() {
    const roles = await this.prisma.role.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return roles.map(({ _count, ...role }) => ({
      ...role,
      permissions: role.permissions.filter(isPermission),
      userCount: _count.users,
    }));
  }

  async create(dto: CreateRoleDto, actorId: string | null, ip?: string) {
    const base = slugify(dto.name) || 'rol';
    let key = base;
    for (let i = 2; await this.prisma.role.findUnique({ where: { key } }); i++)
      key = `${base}-${i}`;

    const role = await this.prisma.role.create({
      data: {
        key,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        permissions: dto.permissions,
      },
    });
    await this.audit.record({
      userId: actorId,
      action: 'role.created',
      entityType: 'role',
      entityId: role.id,
      metadata: { name: role.name, permissions: role.permissions },
      ip,
    });
    return role;
  }

  async update(id: string, dto: UpdateRoleDto, actorId: string | null, ip?: string) {
    const role = await this.findOrThrow(id);
    if (role.key === ADMIN_ROLE_KEY) {
      throw new BadRequestException('El rol Administrador no se puede modificar');
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        permissions: dto.permissions,
      },
    });
    await this.audit.record({
      userId: actorId,
      action: 'role.updated',
      entityType: 'role',
      entityId: id,
      metadata: { before: { name: role.name, permissions: role.permissions }, after: { ...dto } },
      ip,
    });
    return updated;
  }

  async remove(id: string, actorId: string | null, ip?: string) {
    const role = await this.findOrThrow(id);
    if (role.isSystem) throw new BadRequestException('Los roles del sistema no se pueden eliminar');
    const users = await this.prisma.user.count({ where: { roleId: id } });
    if (users > 0)
      throw new ConflictException('El rol tiene usuarios asignados; cámbialos de rol primero');

    await this.prisma.role.delete({ where: { id } });
    await this.audit.record({
      userId: actorId,
      action: 'role.deleted',
      entityType: 'role',
      entityId: id,
      metadata: { name: role.name },
      ip,
    });
  }

  private async findOrThrow(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return role;
  }
}
