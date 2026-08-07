import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getTokens, setTokens, clearTokens } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // We don't have a /me endpoint, so we trust a stored user snapshot
    // written at login time and let 401s downstream clear it out.
    const stored = localStorage.getItem('pulse_user');
    if (stored && getTokens().accessToken) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        /* ignore corrupt value */
      }
    }
    setReady(true);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setTokens(data);
    localStorage.setItem('pulse_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email, password) => {
    const data = await api.register(email, password);
    setTokens(data);
    localStorage.setItem('pulse_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    clearTokens();
    localStorage.removeItem('pulse_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
