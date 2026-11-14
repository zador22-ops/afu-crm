// Сітка плей-оф у CRM — так само, як її бачить уболівальник (бриф crm-bracket-editor, Андрій 14.11).
//
// Дерево малюємо з тих самих даних і тією самою розкладкою, що й застосунок:
//   дані      — публічний Default `bracket/byStage/allInfo` (рахунок серії, пари з двох матчів, переможець);
//   розкладка — `розкластиСітку` з ./bracketLayout.js, дослівна копія AFU utils/bracketLayout.js (тест звіряє).
// Список турів і учасників для редагування — як і раніше, з crm `tournaments/{id}/bracket` і `participants`.

/** Етапи типу «сітка» турніру з їхніми раундами, у порядку турів. */
export function стадіїСітки(tours) {
  const стадії = new Map();
  for (const т of tours || []) {
    if (т?._stage?.stage_type !== 'сітка') continue;
    const id = т.league_stage_id;
    if (!стадії.has(id)) стадії.set(id, { id, назва: т._stage.stage_name || 'Плей-оф', раунди: [] });
    стадії.get(id).раунди.push(т);
  }
  return [...стадії.values()];
}

const зіграний = (м) => Number(м?.match_status_id) === 4;

/**
 * Рядок стану пари під командами: чи є матчі й чи зіграні. Рахунок картка показує сама (як у застосунку),
 * тож тут — лише те, чого з рахунку не видно. null — усе зіграно, підпис не потрібен.
 */
export function станПари(пара) {
  const матчі = Array.isArray(пара?.legs) ? пара.legs : [];
  if (!матчі.length) return 'матчу ще немає';
  const зіграно = матчі.filter(зіграний).length;
  if (зіграно === матчі.length) return null;
  if (матчі.length === 1) return 'матч призначено, не зіграний';
  return `зіграно ${зіграно} з ${матчі.length}`;
}

/** Рахунок одного матчу пари в орієнтації пари [команда 1, команда 2], серія пенальті окремо. */
export function рахунокМатчу(матч) {
  if (!зіграний(матч) || !Array.isArray(матч?.score)) return null;
  const [а, б] = матч.score;
  const серія = Array.isArray(матч.penalty) ? ` (пен. ${матч.penalty[0]}:${матч.penalty[1]})` : '';
  return `${а}:${б}${серія}`;
}
