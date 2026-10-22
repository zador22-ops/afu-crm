// Посилання арени з Google Карт (бриф arena-map, п. 2; мокап — розділ CRM у
// https://claude.ai/artifact/HzatUCGQPJQFZV7Pjdt7sj; контракт —
// docs/xano/arena-map.md у репо AFU).
//
// Координати визначає СЕРВЕР — функція Backend «Venue map parse» під час
// збереження (і коротке maps.app.goo.gl/… розгортає лише він). Тож:
// - щойно збережено — показуємо його відповідь (_map.kind, _map.message);
// - у списку — за Venues.lat/lng; причину без координат відновлюємо тим самим
//   розбором (venueMapParse.js), крім короткого посилання — куди воно вело,
//   знає лише сервер;
// - поки людина вставляє — той самий розбір як підказка.
import { розібрати } from './venueMapParse.js';

// Тексти — дослівно з контракту Backend (поле message)
export const ПОВІДОМЛЕННЯ = {
  search: 'Це посилання на пошук, а не на місце. Відкрийте саму арену в Google Картах і скопіюйте посилання на неї',
  no_coords: "У посиланні немає координат. Відкрийте арену в Google Картах на комп'ютері й скопіюйте адресу з рядка браузера",
  unresolved: 'Коротке посилання не відкрилось — перевірте його',
  not_google: 'Це не посилання з Google Карт',
  empty: 'Посилання немає — застосунок шукатиме арену за назвою',
};
const знайдено = (lat, lng) => `Точку знайдено: ${Number(lat)}, ${Number(lng)}`;

export const наКарті = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

const тон = (kind) => (kind === 'place' ? 'ok' : kind === 'empty' ? 'none' : 'warn');
const є = (x) => x !== null && x !== undefined && x !== '';

/** Відповідь сервера після збереження: _map = {kind, lat, lng, message, …}. */
export function статусЗСервера(map) {
  const kind = map?.kind || 'empty';
  return {
    тон: тон(kind),
    текст: map?.message || (kind === 'place' ? знайдено(map.lat, map.lng) : ПОВІДОМЛЕННЯ[kind] || ПОВІДОМЛЕННЯ.no_coords),
    href: kind === 'place' && є(map?.lat) && є(map?.lng) ? наКарті(map.lat, map.lng) : undefined,
  };
}

/** Статус збереженої арени в списку — за lat/lng від сервера. */
export function статусАрени(v) {
  if (є(v?.lat) && є(v?.lng)) return { тон: 'ok', текст: знайдено(v.lat, v.lng), href: наКарті(v.lat, v.lng) };
  const { kind } = розібрати(v?.map_url || '');
  if (kind === 'empty') return { тон: 'none', текст: ПОВІДОМЛЕННЯ.empty };
  if (kind === 'short' || kind === 'place') {
    // Коротке без координат: або не відкрилось, або (найчастіше) «Поділитися»
    // з телефона веде на місце без координат. Точну причину сервер показав
    // при збереженні; у списку — порада для частішого випадку.
    return {
      тон: 'warn',
      текст: `Точку з посилання не знайдено. ${ПОВІДОМЛЕННЯ.no_coords}`,
    };
  }
  return { тон: 'warn', текст: ПОВІДОМЛЕННЯ[kind] || ПОВІДОМЛЕННЯ.no_coords };
}

/** Підказка під полем, поки посилання не збережене. */
export function підказкаДоЗбереження(url) {
  const р = розібрати(url);
  if (р.kind === 'place') return { тон: 'ok', текст: `${знайдено(р.lat, р.lng)}. Збережіть — сервер перевірить`, href: наКарті(р.lat, р.lng) };
  if (р.kind === 'short') return { тон: 'none', текст: 'Коротке посилання — точку знайде сервер після збереження' };
  return { тон: тон(р.kind), текст: ПОВІДОМЛЕННЯ[р.kind] || ПОВІДОМЛЕННЯ.no_coords };
}
