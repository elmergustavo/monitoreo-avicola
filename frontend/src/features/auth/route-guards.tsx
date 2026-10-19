import { Navigate, Outlet, useLocation } from 'react-router';
import type { Permission } from '@/lib/types';
import { useAuth } from './auth-context';
import { FullPageLoader } from '@/components/full-page-loader';
import { NoAccess } from '@/components/no-access';

/** Requires a session; sends users with a temporary password to change it first. */
export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user?.mustChangePassword && location.pathname !== '/cambiar-contrasena') {
    return <Navigate to="/cambiar-contrasena" replace />;
  }
  return <Outlet />;
}

export function RequirePermission({ permission }: { permission: Permission }) {
  const { can } = useAuth();
  return can(permission) ? <Outlet /> : <NoAccess />;
}
