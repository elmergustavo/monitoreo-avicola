import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, refreshSession, setAccessToken, setSessionExpiredHandler } from '@/lib/api';
import type { CurrentUser, Permission } from '@/lib/types';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const reloadUser = useCallback(async () => {
    setUser(await api<CurrentUser>('/auth/me'));
  }, []);

  // Restore the session from the refresh cookie on first load. If the server
  // cannot be reached (no internet, API restarting), keep retrying instead of
  // signing the user out: their session is probably still valid.
  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; !cancelled; attempt++) {
        const refreshed = await refreshSession();
        if (cancelled) return;
        if (refreshed.status === 'expired') {
          setStatus('anonymous');
          return;
        }
        if (refreshed.status === 'ok') {
          try {
            const me = await api<CurrentUser>('/auth/me');
            if (cancelled) return;
            setUser(me);
            setStatus('authenticated');
            return;
          } catch (err) {
            const temporary = err instanceof ApiError && (err.status === 0 || err.status >= 500);
            if (!temporary) {
              if (!cancelled) clearSession();
              return;
            }
          }
        }
        setStatus('reconnecting');
        await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1_000 * 2 ** attempt)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuthRetry: true,
    });
    setAccessToken(accessToken);
    const me = await api<CurrentUser>('/auth/me');
    setUser(me);
    setStatus('authenticated');
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      reloadUser,
      can: (permission: Permission) => user?.permissions.includes(permission) ?? false,
    }),
    [status, user, login, logout, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
