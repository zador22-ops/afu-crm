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
