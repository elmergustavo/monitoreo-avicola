import { Navigate } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { OverviewPage } from './overview-page';

/** Users without telemetry access land on their profile instead of the overview. */
export function HomePage() {
  const { can } = useAuth();
  return can('telemetry.read') ? <OverviewPage /> : <Navigate to="/perfil" replace />;
}
