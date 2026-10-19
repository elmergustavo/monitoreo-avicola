import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/app-shell';
import { NoAccess } from '@/components/no-access';
import { AlertsPage } from '@/features/alerts/alerts-page';
import { AuditPage } from '@/features/audit/audit-page';
import { ChangePasswordPage } from '@/features/auth/change-password-page';
import { LoginPage } from '@/features/auth/login-page';
import { RequireAuth, RequirePermission } from '@/features/auth/route-guards';
import { DevicesPage } from '@/features/devices/devices-page';
import { HomePage } from '@/features/monitoring/home-page';
import { ShedPage } from '@/features/monitoring/shed-page';
import { NotificationsAdminPage } from '@/features/notifications/notifications-admin-page';
import { ProfilePage } from '@/features/profile/profile-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { RolesPage } from '@/features/roles/roles-page';
import { UsersPage } from '@/features/users/users-page';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/cambiar-contrasena', element: <ChangePasswordPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          {
            element: <RequirePermission permission="telemetry.read" />,
            children: [
              { path: '/galpones/:id', element: <ShedPage /> },
              { path: '/alertas', element: <AlertsPage /> },
            ],
          },
          {
            element: <RequirePermission permission="reports.export" />,
            children: [{ path: '/reportes', element: <ReportsPage /> }],
          },
          {
            path: '/administracion',
            children: [
              { element: <RequirePermission permission="devices.manage" />, children: [{ path: 'galpones', element: <DevicesPage /> }] },
              { element: <RequirePermission permission="users.read" />, children: [{ path: 'usuarios', element: <UsersPage /> }] },
              { element: <RequirePermission permission="roles.manage" />, children: [{ path: 'roles', element: <RolesPage /> }] },
              { element: <RequirePermission permission="alerts.manage" />, children: [{ path: 'notificaciones', element: <NotificationsAdminPage /> }] },
              { element: <RequirePermission permission="audit.read" />, children: [{ path: 'bitacora', element: <AuditPage /> }] },
            ],
          },
          { path: '/perfil', element: <ProfilePage /> },
          { path: '*', element: <NoAccess /> },
        ],
      },
    ],
  },
]);
