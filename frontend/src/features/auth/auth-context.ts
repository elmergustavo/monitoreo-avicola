import { createContext, useContext } from 'react';
import type { CurrentUser, Permission } from '@/lib/types';

/** 'reconnecting': the session could not be checked because the server is unreachable. */
export type AuthStatus = 'loading' | 'reconnecting' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  reloadUser: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
