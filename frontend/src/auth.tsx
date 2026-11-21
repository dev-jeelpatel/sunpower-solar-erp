import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post, setUnauthorizedHandler, tokenStore } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Pages only render under <AuthProvider>, so the context is always set. */
export const useAuth = () => useContext(AuthContext) as AuthState;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) { setReady(true); return; }
    api<User>('/auth/me').then(setUser).catch(() => tokenStore.clear()).finally(() => setReady(true));
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await post<{ token: string; user: User }>('/auth/login', { email, password });
    tokenStore.set(token);
    setUser(u);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Which roles may write to which area (mirrors server rules; the server is the source of truth). */
export const can = (user: User | null, ...roles: Role[]) => !!user && (user.role === 'admin' || roles.includes(user.role));

/** For pages rendered behind the login guard: the signed-in user is always present. */
export const useCurrentUser = () => useAuth().user as User;
