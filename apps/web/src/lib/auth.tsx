'use client';

import { useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401)) console.error(e);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    router.replace('/login');
  }, [router]);

  return <AuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Redirects to /login when there is no session; returns the user once known. */
export function useRequireUser(): User | null {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) {
      const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, router]);
  return user;
}
