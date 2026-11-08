// Події матчу (Statistic): правила форми CRM, що мають збігатися із сервером

// Типи подій і голів — довідники Xano «Types of match events» і «Types of goals»
export const ГОЛ = 1;
export const КАРТКА = 2;
export const НЕЗАБИТИЙ = 3;

/**
 * «Не забитий» — це завжди незабитий пенальті: лише «Пенальті» (3) або «Дабл пенальті» (4), обовʼязково
 * (бриф afu-chat-dooprats-2026-11-07, п. 1, Богдан). «Звичайний» і «Автогол» для нього не пропонуються.
 */
export const ТИПИ_НЕЗАБИТОГО = [3, 4];

/** Варіанти типу для «Не забитого» з довідника голів; назви без дужок («(Пенальті)» → «Пенальті»). */
export function типиНезабитого(goals) {
  return (goals || [])
    .filter((x) => ТИПИ_НЕЗАБИТОГО.includes(x.id))
    .map((x) => ({ id: x.id, label: String(x.Type || '').replace(/[()]/g, '').trim() }));
}

/** Початкове значення вибору для «Не забитого»: старі записи з 0 — без вибору, хай людина обере. */
export function типНезабитогоЗа(item) {
  const t = Number(item?.types_of_goals_id);
  return item?.types_of_match_events_id === НЕЗАБИТИЙ && ТИПИ_НЕЗАБИТОГО.includes(t) ? String(t) : '';
}

/** «Не забитий» без типу пенальті (старі записи з 0) — показати АФУ, що проставити. */
export const незабитийБезТипу = (e) => e?.types_of_match_events_id === НЕЗАБИТИЙ && !ТИПИ_НЕЗАБИТОГО.includes(Number(e?.types_of_goals_id));

// ——— Екстра-тайми й серія пенальті (бриф match-extra-time, п. 3) ———
// Хвилини за R59 і брифом: основний час 1–40, 1-й екстра-тайм 41–45, 2-й 46–50,
// серія пенальті — 51 (усі удари серії на одній хвилині). Чи можна продовжувати
// матч, вирішує сервер (can_extend: кубок або стадія-сітка); система регламент не вгадує.
export const ОСНОВНИЙ_ЧАС = 40;
export const ХВ_СЕРІЇ = 51;

export const ПЕРІОДИ = [
  { key: 'main', label: 'Основний час', min: 1, max: ОСНОВНИЙ_ЧАС },
  { key: 'et1', label: '1-й екстра-тайм', min: 41, max: 45 },
  { key: 'et2', label: '2-й екстра-тайм', min: 46, max: 50 },
  { key: 'pens', label: 'Серія пенальті', min: ХВ_СЕРІЇ, max: ХВ_СЕРІЇ },
];

/** Період за хвилиною; хвилини поза 41–51 (і порожні) — основний час. */
export function періодЗа(minute) {
  const m = Number(minute);
  return ПЕРІОДИ.find((p) => p.key !== 'main' && m >= p.min && m <= p.max) || ПЕРІОДИ[0];
}

/** Хвилини періоду для вибору (крім основного часу — там вільне число). */
export const хвилиниПеріоду = (key) => {
  const p = ПЕРІОДИ.find((x) => x.key === key);
  return p ? Array.from({ length: p.max - p.min + 1 }, (_, i) => p.min + i) : [];
};

/** Підпис хвилини в протоколі: «43 · 1-й екстра-тайм», «Серія пенальті»; основний час — просто число. */
export function підписХвилини(minute) {
  if (minute == null || minute === '') return '—';
  const p = періодЗа(minute);
  if (p.key === 'main') return String(minute);
  return p.key === 'pens' ? p.label : `${minute} · ${p.label}`;
}

/** Чи показувати в «Події матчу» вибір періоду: матч, де продовження можливе, або подія вже на 41–51. */
export const зПеріодами = (match, item) => match?.can_extend === true || періодЗа(item?.minute).key !== 'main';

// Чим завершився матч (Match.finish). Старі матчі й поле без значення — «Основний час».
export const ЗАВЕРШЕННЯ = [
  { key: 'regular', label: 'Основний час' },
  { key: 'et', label: 'Після екстра-таймів' },
  { key: 'pens', label: 'По пенальті' },
];
export const завершенняЗа = (match) => (ЗАВЕРШЕННЯ.some((f) => f.key === match?.finish) ? match.finish : 'regular');
