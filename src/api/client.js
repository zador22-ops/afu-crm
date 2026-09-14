// Один клієнт для трьох API-груп Xano. Токен лежить у localStorage і йде в
// кожен запит заголовком Authorization, як в ADMIN АФУ.
const XANO = 'https://xdeg-kg7i-jjtu.f2.xano.io';

export const API = {
  crm: `${XANO}/api:6HPZ3cxp`, // група crm — усе, що пише CRM
  base: `${XANO}/api:DSaYr0P-`, // група Default — публічні читання, спільні з ADMIN і фан-застосунком
  auth: `${XANO}/api:97fj3W2I`, // група authentication — auth/login, auth/me
};

const КЛЮЧ = 'afu-crm-token';

export const token = {
  get: () => {
    try {
      return localStorage.getItem(КЛЮЧ) || '';
    } catch {
      return '';
    }
  },
  set: (t) => {
    try {
      t ? localStorage.setItem(КЛЮЧ, t) : localStorage.removeItem(КЛЮЧ);
    } catch {
      /* приватний режим */
    }
  },
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

/**
 * request('crm', '/seasons')                          — GET
 * request('crm', '/seasons', { method: 'POST', body })  — JSON
 * request('crm', '/clubs/1/image', { method: 'POST', form: FormData })
 * request('crm', '/tournaments', { query: { season_id: 3 } })
 */
export async function request(group, path, { method = 'GET', body, form, query, auth = true } = {}) {
  const url = new URL(API[group] + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const headers = {};
  const t = token.get();
  if (auth && t) headers.Authorization = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: form ? form : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401 && auth) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// Зручні короткі виклики для групи crm
export const crm = {
  get: (path, query) => request('crm', path, { query }),
  post: (path, body) => request('crm', path, { method: 'POST', body }),
  patch: (path, body) => request('crm', path, { method: 'PATCH', body }),
  del: (path) => request('crm', path, { method: 'DELETE' }),
  upload: (path, form) => request('crm', path, { method: 'POST', form }),
};
