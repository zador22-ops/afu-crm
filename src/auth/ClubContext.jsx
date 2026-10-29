import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { club, crm, setClubUnauthorizedHandler } from '../api/client.js';
import { клубнаСесія, новаСесія, обранийКлубЗбережений, чинна } from './clubSession.js';

const Ctx = createContext(null);

// Чому кабінет закрився — показуємо один раз там, куди людина повернулась
const ПРИЧИНИ = {
  expired_admin: 'Час входу як клуб минув (1 год) — ви знову в CRM АФУ',
  expired: 'Сесія кабінету клубу закінчилась — увійдіть знову',
  unauthorized: 'Сесія кабінету клубу закінчилась — увійдіть знову',
};

/**
 * Кабінет клубу (задача 1.3): сесія токена club_account окремо від входу
 * співробітника (AuthContext). Кеш запитів чиститься на кожному вході й
 * виході — дані АФУ й дані клубу не мають перетікати між режимами.
 */
export function ClubProvider({ children }) {
  const qc = useQueryClient();
  const [session, setSession] = useState(() => клубнаСесія.get());
  const [notice, setNotice] = useState(null);

  const exit = useCallback(
    (причина) => {
      const була = клубнаСесія.get();
      клубнаСесія.clear();
      // Вибір клубу — для цієї сесії: наступний акаунт почне з першого свого клубу
      обранийКлубЗбережений.set(null);
      setSession(null);
      qc.clear();
      if (причина) setNotice(ПРИЧИНИ[причина === 'expired' && була?.as_admin ? 'expired_admin' : причина] || null);
    },
    [qc]
  );

  // 401 від клубного запиту — закрити лише кабінет клубу
  useEffect(() => {
    setClubUnauthorizedHandler(() => exit(клубнаСесія.get()?.as_admin ? 'expired' : 'unauthorized'));
  }, [exit]);

  // Токен «як клуб» живе 1 год, клубу — 12: закрити, щойно спливе
  useEffect(() => {
    if (!session?.expires_at) return undefined;
    const лишилось = session.expires_at - Date.now();
    if (лишилось <= 0) {
      const t = setTimeout(() => exit('expired'), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => exit('expired'), Math.min(лишилось, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [session, exit]);

  const start = useCallback(
    (s) => {
      qc.clear();
      клубнаСесія.set(s);
      setSession(s);
      setNotice(null);
    },
    [qc]
  );

  const login = useCallback(async (email, password) => start(новаСесія(await club.login(email, password))), [start]);

  // Адмін АФУ «входить як клуб»: токен АФУ лишається, клубний — поверх на 1 год
  const asAdmin = useCallback(
    async (accountId) => start(новаСесія(await crm.post(`/club-accounts/${accountId}/impersonate`), { as_admin: true })),
    [start]
  );

  const value = useMemo(
    () => ({
      session: чинна(session) ? session : null,
      notice,
      clearNotice: () => setNotice(null),
      login,
      asAdmin,
      exit: () => exit(null),
    }),
    [session, notice, login, asAdmin, exit]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useClub = () => useContext(Ctx);
