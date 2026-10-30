// Вкладка «Склад» кабінету клубу (самообслуговування клубів, 3.1)

/**
 * Галочки турнірів форми → rows для POST /club/clubs/{id}/players (лише обрані), у порядку вибору:
 * перший стає основним турніром гравця (варіант 3, контракт 4.2 розділ 5).
 */
export function рядкиДляЗаявки(турніри) {
  return Object.entries(турніри || {})
    .filter(([, р]) => р && р.on)
    .sort(([, a], [, b]) => (a.order || 0) - (b.order || 0))
    .map(([id, р]) => ({ leagues_id: Number(id), Number: Number(р.Number) || null, positions_id: Number(р.positions_id) || null, Captain: !!р.Captain }));
}

/** Відкрита заявка на чинного гравця → підпис у колонці «Стан» (null — змін немає); турнір — якщо не основний. */
export function станРядка(request, турнір) {
  if (!request) return null;
  const що = (request.action === 'remove' ? 'виведення' : 'зміна') + (турнір ? ` (${турнір})` : '');
  return request.status === 'submitted' ? { тон: 'wait', текст: `${що} — на погодженні` } : { тон: 'muted', текст: `${що} — чернетка` };
}

/** Турніри, з яких можна вивести гравця: основний (Team) і додаткові (team_league); open — вікно відкрите. */
export function виведенняЗ(гравець, турніри) {
  const т = new Map((турніри || []).map((t) => [t.id, t]));
  return [
    { leagues_id: гравець.leagues_id, name: гравець.league_name, main: true },
    ...(гравець.also || []).map((д) => ({ leagues_id: д.leagues_id, name: д.league_name, main: false })),
  ].map((в) => ({ ...в, open: !!т.get(в.leagues_id)?.window_open }));
}

const ПОЛЯ_ОСОБИ = ['prizvushche', 'Name', 'po_batkovi', 'Date_of_birth', 'City', 'Growth', 'Weight', 'Photo'];

/**
 * Початкові значення форми «Змінити гравця» (3.1б): чинні дані + відкрита чернетка («як буде»).
 * ліга — турнір, номер якого міняємо: основний (Team) чи додатковий (team_league).
 */
/** Дані особи для форми (склад і штаб): чинні + відкрита чернетка person.update. */
export function формаОсоби(запис) {
  const особа = { ...Object.fromEntries(ПОЛЯ_ОСОБИ.map((k) => [k, запис[k === 'Photo' ? 'photo' : k] ?? null])), ...(запис.person_request?.after || {}) };
  return Object.fromEntries(ПОЛЯ_ОСОБИ.map((k) => [k, k === 'Photo' ? особа.Photo : k === 'Date_of_birth' ? рядок(особа[k]).slice(0, 10) : рядок(особа[k])]));
}
const рядок = (v) => (v == null ? '' : String(v));

export function формаГравця(гравець, ліга = гравець.leagues_id) {
  const person = формаОсоби(гравець);
  const основний = Number(ліга) === гравець.leagues_id;
  const д = (гравець.also || []).find((x) => x.leagues_id === Number(ліга));
  const чинний = основний ? { Number: гравець.Number, positions_id: гравець.positions_id, Captain: гравець.Captain } : { Number: д?.Number ?? null };
  const r = гравець.request;
  const чернетка = r && r.action === 'update' && r.leagues_id === Number(ліга) ? r.after || {} : {};
  const squad = { ...чинний, ...чернетка };
  return {
    person,
    squad: { leagues_id: Number(ліга), Number: рядок(squad.Number), ...(основний ? { positions_id: рядок(squad.positions_id), Captain: !!squad.Captain } : {}) },
    основний,
  };
}
