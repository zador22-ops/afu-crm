// Сесія кабінету клубу (самообслуговування клубів, задача 1.3). Токен клубу
// (auth-таблиця club_account) живе ОКРЕМО від токена співробітника АФУ
// (Users): свій ключ у localStorage, свій вихід. Вихід з кабінету клубу не
// розлогінює АФУ, і навпаки. Сервер: docs/club-self-service-api.md.
//
// Сесія: { token, expires_at, as_admin, account: { id, name } }.
// as_admin — Адмін увійшов «як клуб» (POST club-accounts/{id}/impersonate):
// токен на 1 год, після виходу чи спливання — назад у CRM АФУ.

const КЛЮЧ = 'afu-crm-club-session';
const КЛУБ = 'afu-crm-club-current';

const сховище = {
  get(ключ) {
    try {
      return localStorage.getItem(ключ);
    } catch {
      return null;
    }
  },
  set(ключ, значення) {
    try {
      if (значення == null) localStorage.removeItem(ключ);
      else localStorage.setItem(ключ, значення);
    } catch {
      /* приватний режим — сесія живе до перезавантаження */
    }
  },
};

/** Розбір збереженої сесії; зіпсоване чи без токена — null. */
export function розібрати(рядок) {
  try {
    const s = JSON.parse(рядок || 'null');
    return s && typeof s.token === 'string' && s.token ? s : null;
  } catch {
    return null;
  }
}

export const клубнаСесія = {
  get: () => розібрати(сховище.get(КЛЮЧ)),
  set: (s) => сховище.set(КЛЮЧ, s ? JSON.stringify(s) : null),
  clear: () => сховище.set(КЛЮЧ, null),
};

export const обранийКлубЗбережений = {
  get: () => Number(сховище.get(КЛУБ)) || null,
  set: (id) => сховище.set(КЛУБ, id ? String(id) : null),
};

/** Сесія з відповіді сервера: login (12 год) чи impersonate (expires_in). */
export function новаСесія({ authToken, account, expires_in }, { as_admin = false, now = Date.now() } = {}) {
  const строк = (Number(expires_in) || 12 * 3600) * 1000;
  return { token: authToken, expires_at: now + строк, as_admin, account: account ? { id: account.id, name: account.name } : null };
}

export const чинна = (s, now = Date.now()) => !!s?.token && (!s.expires_at || s.expires_at > now);

/** Скільки лишилось, хв (для смуги «як клуб»); 0 — сплила. */
export const хвилинЛишилось = (s, now = Date.now()) => (s?.expires_at ? Math.max(0, Math.ceil((s.expires_at - now) / 60000)) : 0);

/**
 * Хто зараз за CRM:
 * 'club-admin' — Адмін у кабінеті клубу; 'club' — представник клубу;
 * 'staff' — співробітник АФУ; 'anon' — ніхто.
 * Чинна сесія клубу важить більше за токен АФУ: поки Адмін «як клуб», він
 * бачить лише кабінет клубу.
 */
export function режим({ staff, club, now = Date.now() }) {
  if (чинна(club, now)) return club.as_admin ? 'club-admin' : 'club';
  return staff ? 'staff' : 'anon';
}

export const ВХІД_КЛУБУ = '/club/login';
export const КАБІНЕТ = '/club';
// Куди повертається співробітник з адреси кабінету — після виходу «як клуб»
// (вручну чи коли сплила година) він опиняється саме тут
export const АКАУНТИ_КЛУБІВ = '/users?tab=clubs';

/**
 * Куди перенаправити зі шляху за режимом; null — можна лишатись.
 * Представник клубу не відкриває жодної сторінки АФУ навіть за прямою
 * адресою; співробітник — кабінету клубу без входу «як клуб».
 */
export function перенаправлення(реж, шлях) {
  const кабінет = шлях === КАБІНЕТ || шлях.startsWith(КАБІНЕТ + '/');
  const вхідКлубу = шлях === ВХІД_КЛУБУ;
  if (реж === 'club' || реж === 'club-admin') return кабінет && !вхідКлубу ? null : КАБІНЕТ;
  if (реж === 'staff') return кабінет && !вхідКлубу ? АКАУНТИ_КЛУБІВ : null;
  // ніхто: лише два входи
  return шлях === '/login' || вхідКлубу ? null : кабінет ? ВХІД_КЛУБУ : '/login';
}

/** Поточний клуб кабінету: збережений, якщо він ще серед клубів акаунта, інакше перший. */
export function обранийКлуб(clubs, збережений) {
  const список = Array.isArray(clubs) ? clubs : [];
  if (збережений && список.some((c) => Number(c.teaminfo_id) === Number(збережений))) return Number(збережений);
  return список.length ? Number(список[0].teaminfo_id) : null;
}
