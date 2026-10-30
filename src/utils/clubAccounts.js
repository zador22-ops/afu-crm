// «Акаунти клубів» (самообслуговування клубів, 1.3): що надсилати на сервер
// і які клуби показати у виборі. Сервер — docs/club-self-service-api.md.

const однакові = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/**
 * Тіло запиту. Новий акаунт — усе; наявний — лише змінене (PATCH змінює лише
 * надіслане): порожній пароль не надсилаємо, набір клубів — лише якщо змінився.
 */
export function даніАкаунта(item, { email, name, password, active, обрані }) {
  const клуби = [...обрані].map(Number).sort((a, b) => a - b);
  if (!item?.id) return { email: String(email || '').trim(), name: String(name || '').trim(), password, teaminfo_ids: клуби };
  const дані = {};
  if (String(name || '').trim() !== String(item.name || '')) дані.name = String(name || '').trim();
  if (active !== (item.is_active !== false)) дані.is_active = active;
  if (password) дані.password = password;
  const були = new Set((item.clubs || []).map((c) => Number(c.teaminfo_id)));
  if (!однакові(були, new Set(клуби))) дані.teaminfo_ids = клуби;
  return дані;
}

/**
 * Клуби для вибору: без суперників (team_kind), за пошуком; обрані — завжди
 * зверху й видно навіть поза пошуком, далі актуальні, архів — у кінці.
 */
export function клубиДляВибору(clubs, q, обрані) {
  const пошук = String(q || '').trim().toLowerCase();
  return (Array.isArray(clubs) ? clubs : [])
    .filter((c) => !c.team_kind)
    .filter((c) => обрані.has(c.id) || !пошук || String(c.TeamName || '').toLowerCase().includes(пошук))
    .sort(
      (a, b) =>
        Number(обрані.has(b.id)) - Number(обрані.has(a.id)) ||
        Number(b.Relevance !== false) - Number(a.Relevance !== false) ||
        String(a.TeamName || '').localeCompare(String(b.TeamName || ''), 'uk')
    );
}

// Право 22 «Акаунти клубів» (контракт 1.1). Сервер перевіряє сам; тут — лише щоб не показувати вкладку
export const ПРАВО_АКАУНТИ_КЛУБІВ = 22;

/** Чи має роль користувача право: відповідь GET crm/roles ({roles: [{id, access_rights_id}]}). */
export function маєПраво(ролі, roleId, право) {
  const р = (ролі?.roles || []).find((x) => x.id === roleId);
  return !!р && (р.access_rights_id || []).includes(право);
}

/** Помилка запиту акаунтів: 403 — зрозумілим текстом. */
export function помилкаАкаунтів(error) {
  if (error?.status === 403) return new Error('Немає права «Акаунти клубів»');
  return error || null;
}
