import type { Permission } from './types';

/** Spanish labels for the permission catalog (keys come from the API). */
export const PERMISSION_INFO: Record<Permission, { label: string; description: string }> = {
  'telemetry.read': { label: 'Ver galpones', description: 'Temperatura, riego, gráficas y eventos' },
  'reports.export': { label: 'Descargar reportes', description: 'Exportar reportes de temperatura y riego en PDF y Excel' },
  'alerts.manage': { label: 'Gestionar alertas', description: 'Cerrar alertas, recibir escalamientos y ajustar sus tiempos' },
  'settings.manage': { label: 'Ajustar umbrales', description: 'Cambiar los rangos de temperatura de cada galpón' },
  'devices.manage': { label: 'Administrar galpones', description: 'Registrar dispositivos y cambiar sus API keys' },
  'users.read': { label: 'Ver usuarios', description: 'Consultar la lista de usuarios y roles' },
  'users.manage': { label: 'Administrar usuarios', description: 'Crear, editar, desactivar y restablecer contraseñas' },
  'roles.manage': { label: 'Administrar roles', description: 'Crear y editar roles y sus permisos' },
  'audit.read': { label: 'Ver bitácora', description: 'Historial de inicios de sesión y cambios' },
};

export const PERMISSION_ORDER = Object.keys(PERMISSION_INFO) as Permission[];
