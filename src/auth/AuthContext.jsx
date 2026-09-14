import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request, setUnauthorizedHandler, token } from '../api/client.js';

const Ctx = createContext(null);

// Ролі з таблиці Types of user roles: 1 Адмін, 2 Делегат, 3 Повний перегляд.
// Конструктор ролей CRM буде окремо (рішення Андрія 2026-09-14); до того — так.
export const РОЛІ = { 1: 'Адмін', 2: 'Делегат', 3: 'Повний перегляд' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    token.set('');
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  // При старті: якщо токен є — питаємо auth/me
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token.get()) return setReady(true);
      try {
        const me = await request('auth', '/auth/me');
        if (alive) setUser(me);
      } catch {
        token.set('');
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (id, password) => {
    // Вхід за числовим id користувача таблиці Users, як в ADMIN АФУ
    const res = await request('auth', '/auth/login', {
      method: 'POST',
      body: { id: Number(id), password },
      auth: false,
    });
    if (!res?.authToken) throw new Error('Невірний id або пароль');
    token.set(res.authToken);
    const me = await request('auth', '/auth/me');
    setUser({ ...me, types_of_user_roles_id: me?.types_of_user_roles_id ?? res.types_of_user_roles_id });
    return me;
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
