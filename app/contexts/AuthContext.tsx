'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

type UserRole = 'portfolio' | 'analyst';

interface User {
  email: string;
  name: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
}

const ADMIN_EMAIL = 'aditya@saguncapital.com';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.email === ADMIN_EMAIL;
  const isAnalyst = user?.role === 'analyst';

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/verify');
      const data = await res.json();
      if (data.authenticated) {
        setUser({
          email: data.user.email,
          name: data.user.name,
          role: data.user.role || 'analyst',
        });
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (user) {
        try {
          await fetch('/api/auth/refresh', { method: 'POST' });
        } catch (error) {
          console.error('Token refresh failed:', error);
        }
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    setUser({
      email: data.user.email,
      name: data.user.name,
      role: data.user.role || 'analyst',
    });
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
  };

  const register = async (email: string, password: string, name: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isAnalyst, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
