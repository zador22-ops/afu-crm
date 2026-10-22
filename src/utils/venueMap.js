// Посилання арени з Google Карт (бриф arena-map, п. 2; мокап — розділ CRM у
// https://claude.ai/artifact/HzatUCGQPJQFZV7Pjdt7sj).
//
// Координати визначає СЕРВЕР (Backend, п. 1): він же йде за переадресацією
// короткого maps.app.goo.gl/…, чого браузер не може (CORS). Тож істина про
// збережену арену — Venues.lat/lng: є — «точку знайдено», немає при непорожньому
// map_url — попередження. Розбір тут — лише підказка, поки людина вставляє
// посилання, до збереження.

const ЧИСЛО = '(-?\\d{1,3}(?:\\.\\d+)?)';
const ПАРИ = [
  new RegExp(`@${ЧИСЛО},${ЧИСЛО}`), // …/maps/place/…/@48.43,35.04,17z
  new RegExp(`!3d${ЧИСЛО}!4d${ЧИСЛО}`), // …/data=!3m1!4b1!4m6!3m5!…!3d48.43!4d35.04
  new RegExp(`[?&](?:q|query|ll|destination)=${ЧИСЛО}(?:,|%2C)\\s*${ЧИСЛО}`, 'i'), // …/maps?q=48.43,35.04
];

const вМежах = (lat, lng) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Координати з повного посилання; null — якщо їх у тексті немає. */
export function координатиЗ(url) {
  const s = String(url || '');
  for (const re of ПАРИ) {
    const m = s.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (вМежах(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

/**
 * Що за посилання вставили:
 * '' — порожнє; 'coords' — повне з координатами; 'short' — maps.app.goo.gl
 * (координати знайде сервер); 'search' — пошук, а не місце; 'place' — інше
 * посилання Google Карт без координат у тексті; 'other' — не Google Карти.
 */
export function видПосилання(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    return 'other';
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && u.pathname.startsWith('/maps'))) return 'short';
  const google = /^(?:maps\.)?google\.[a-z.]+$/.test(host);
  if (!google) return 'other';
  if (координатиЗ(s)) return 'coords';
  if (u.pathname.startsWith('/search') || u.pathname.startsWith('/maps/search')) return 'search';
  if (u.pathname.startsWith('/maps') || host.startsWith('maps.')) return 'place';
  return 'other';
}

const округлити = (x) => Number(x).toFixed(4);
export const наКарті = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

const ПОШУК = 'Це посилання на пошук, а не на місце. Відкрийте арену в Google Картах і скопіюйте посилання звідти';

/**
 * Статус ЗБЕРЕЖЕНОЇ арени — за тим, що повернув сервер.
 * { тон: 'ok' | 'warn' | 'none', текст, href? }
 */
export function статусАрени(v) {
  const url = String(v?.map_url || '').trim();
  const є = v?.lat != null && v?.lng != null && v.lat !== '' && v.lng !== '';
  if (є) return { тон: 'ok', текст: `Точку знайдено: ${округлити(v.lat)}, ${округлити(v.lng)}`, href: наКарті(v.lat, v.lng) };
  if (!url) return { тон: 'none', текст: 'Без посилання — застосунок шукатиме за назвою' };
  if (видПосилання(url) === 'search') return { тон: 'warn', текст: ПОШУК };
  return {
    тон: 'warn',
    текст: 'Точку з посилання не знайдено — застосунок відкриє саме це посилання, без вбудованої карти. Скопіюйте посилання на арену в Google Картах: «Поділитися» → «Копіювати посилання»',
  };
}

/** Підказка під полем, поки людина вставляє посилання (до збереження). */
export function підказкаДоЗбереження(url) {
  const вид = видПосилання(url);
  const к = координатиЗ(url);
  switch (вид) {
    case '':
      return { тон: 'none', текст: 'Без посилання — застосунок шукатиме за назвою' };
    case 'coords':
      return { тон: 'ok', текст: `Точку видно: ${округлити(к.lat)}, ${округлити(к.lng)}. Збережіть — сервер перевірить`, href: наКарті(к.lat, к.lng) };
    case 'short':
      return { тон: 'none', текст: 'Коротке посилання — точку знайде сервер після збереження' };
    case 'search':
      return { тон: 'warn', текст: ПОШУК };
    case 'place':
      return { тон: 'none', текст: 'Координат у тексті посилання не видно — сервер спробує знайти точку після збереження' };
    default:
      return { тон: 'warn', текст: 'Це не посилання з Google Карт. Відкрийте арену в Google Картах: «Поділитися» → «Копіювати посилання»' };
  }
}
