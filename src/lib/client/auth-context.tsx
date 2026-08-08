'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiInvoke, ApiError } from './api';

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  isActive: boolean;
}

interface AuthState {
  loading: boolean;
  hasAnyUser: boolean | null;
  user: CurrentUser | null;
  permissions: Set<string>;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setup: (fullName: string, username: string, password: string) => Promise<void>;
  can: (module: string, action: string) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toPermissionSet(perms: { module: string; action: string }[]): Set<string> {
  return new Set(perms.map((p) => `${p.module}.${p.action}`));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, hasAnyUser: null, user: null, permissions: new Set() });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const { hasAnyUser } = await apiInvoke<{ hasAnyUser: boolean }>('auth:hasAnyUser');
      if (!hasAnyUser) {
        setState({ loading: false, hasAnyUser: false, user: null, permissions: new Set() });
        return;
      }
      const token = window.api.getToken();
      if (!token) {
        setState({ loading: false, hasAnyUser: true, user: null, permissions: new Set() });
        return;
      }
      const { user, permissions: permList } = await apiInvoke<{ user: CurrentUser; permissions: { module: string; action: string }[] }>('auth:me');
      setState({ loading: false, hasAnyUser: true, user, permissions: toPermissionSet(permList) });
    } catch {
      window.api.setToken(null);
      setState({ loading: false, hasAnyUser: true, user: null, permissions: new Set() });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user, permissions: permList } = await apiInvoke<{ token: string; user: CurrentUser; permissions: { module: string; action: string }[] }>('auth:login', { username, password });
    window.api.setToken(token);
    setState({ loading: false, hasAnyUser: true, user, permissions: toPermissionSet(permList) });
  }, []);

  const setup = useCallback(async (fullName: string, username: string, password: string) => {
    const { token, user, permissions: permList } = await apiInvoke<{ token: string; user: CurrentUser; permissions: { module: string; action: string }[] }>('auth:setup', { fullName, username, password });
    window.api.setToken(token);
    setState({ loading: false, hasAnyUser: true, user, permissions: toPermissionSet(permList) });
  }, []);

  const logout = useCallback(async () => {
    await apiInvoke('auth:logout').catch(() => undefined);
    window.api.setToken(null);
    setState((s) => ({ ...s, user: null, permissions: new Set() }));
  }, []);

  const can = useCallback((module: string, action: string) => state.permissions.has(`${module}.${action}`), [state.permissions]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, setup, can, refresh }),
    [state, login, logout, setup, can, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
