/**
 * Permission catalog. Permissions are fixed in code because each one guards
 * specific endpoints; roles are combinations of these keys stored in the DB.
 */
export const PERMISSIONS = [
  'telemetry.read',
  'reports.export',
  'settings.manage',
  'devices.manage',
  'users.read',
  'users.manage',
  'roles.manage',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const isPermission = (value: string): value is Permission =>
  (PERMISSIONS as readonly string[]).includes(value);

export const ADMIN_ROLE_KEY = 'admin';

export interface SystemRoleDefinition {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

/** Roles created by the seed. The admin role always has every permission. */
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: ADMIN_ROLE_KEY,
    name: 'Administrador',
    description: 'Acceso total: usuarios, roles, galpones, configuración y bitácora.',
    permissions: [...PERMISSIONS],
  },
  {
    key: 'supervisor',
    name: 'Encargado',
    description: 'Ve los galpones, descarga reportes y ajusta los umbrales de temperatura.',
    permissions: ['telemetry.read', 'reports.export', 'settings.manage'],
  },
  {
    key: 'viewer',
    name: 'Observador',
    description: 'Solo puede ver el dashboard.',
    permissions: ['telemetry.read'],
  },
];
