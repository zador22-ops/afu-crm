/**
 * Київський час для CRM — читання й ЗАПИС `Match.TimeOfMatch`.
 *
 * Рішення Андрія від 2026-09-11 (те саме, що діє у фанатському застосунку —
 * `utils/kyivTime.js` у репозиторії `afu-futzal`): матч о 15:00 має означати
 * 15:00 у Києві для будь-кого, хто дивиться, незалежно від того, де сидить
 * людина. У базі `TimeOfMatch` — epoch у мілісекундах, момент часу без
 * прив'язки до поясу; переведення в київський календар — задача клієнта.
 *
 * ЧИМ ЦЕ ВІДРІЗНЯЄТЬСЯ ВІД ФАНАТСЬКОГО ЗАСТОСУНКУ. Той лише читає час, тому
 * йому вистачає одного напрямку (epoch → київські поля) і запасного шляху
 * без `Intl` для Hermes/Android. CRM — веб, повний ICU є завжди, запасний
 * шлях не потрібен. Але CRM ще й РЕДАГУЄ `TimeOfMatch` у формі матчу, а
 * `<input type="datetime-local">` вміє лише «стінний» час без поясу: якщо
 * прочитати його значення напряму через `new Date(...)`, воно проллється в
 * пояс браузера, а не в Київ, — і при збереженні матч тихо зсунеться на
 * кілька годин для будь-кого поза Києвом. Тому тут є друга пара функцій
 * (`toKyivInputValue` / `fromKyivInputValue`), яких у фанатському застосунку
 * немає й не потрібно.
 *
 * Знахідка 2026-09-17: `MatchReport.jsx` (рапорт делегата), `MatchPage.jsx`
 * і `TournamentMatches.jsx` рахували час через голий `new Date(ts).getHours()`
 * / `toLocaleString` без `timeZone` — той самий анти-патерн, який у
 * фанатському застосунку вже виправляли. З Києва баг не видно: локальний
 * пояс і цільовий збігаються.
 */

const ПОЯС = 'Europe/Kyiv';
const pad = (n) => String(n).padStart(2, '0');

const частиниФормату = new Intl.DateTimeFormat('en-GB', {
  timeZone: ПОЯС,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Розкладає epoch (мс) на календарні поля за Києвом. */
const kyivParts = (epochMs) => {
  const p = {};
  for (const part of частиниФормату.formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  // Intl о півночі іноді віддає годину 24, а не 0
  return { ...p, hour: p.hour === 24 ? 0 : p.hour };
};

/** `05.09.2026, 15:00` — для списків і заголовків, як у фанатському застосунку. */
export const kyivDateTimeString = (epochMs) => {
  if (!epochMs) return '';
  const p = kyivParts(epochMs);
  return `${pad(p.day)}.${pad(p.month)}.${p.year}, ${pad(p.hour)}:${pad(p.minute)}`;
};

/** `01-07-2026` — формат дати саме такий, як у PDF-рапорту делегата ADMIN. */
export const kyivDateDashString = (epochMs) => {
  if (!epochMs) return '';
  const p = kyivParts(epochMs);
  return `${pad(p.day)}-${pad(p.month)}-${p.year}`;
};

/** `15:00` — час за Києвом окремо від дати. */
export const kyivTimeString = (epochMs) => {
  if (!epochMs) return '';
  const p = kyivParts(epochMs);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

/** `2026-09-05T15:00` — значення для `<input type="datetime-local">`. */
export const toKyivInputValue = (epochMs) => {
  if (!epochMs) return '';
  const p = kyivParts(epochMs);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
};

/**
 * `2026-09-05T15:00` (значення з `datetime-local`, київський стінний час) →
 * epoch мс.
 *
 * Подвійна конвертація без бібліотек: спершу читаємо рядок так, ніби він
 * уже в UTC (це нам одразу дає початкове наближення), дивимось, яким цей
 * момент вийшов би за Києвом, і компенсуємо різницю. Працює для будь-якого
 * зсуву і будь-якого правила літнього часу, бо не рахує зсув сам, а питає
 * в `Intl` — на відміну від запасного шляху у фанатському застосунку, де
 * зсув зашитий (там це прийнятно, бо там лише читання).
 */
export const fromKyivInputValue = (value) => {
  if (!value) return null;
  const припущення = Date.parse(`${value}:00Z`);
  if (Number.isNaN(припущення)) return null;
  const p = kyivParts(припущення);
  const якБиUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second ?? 0);
  const зсувМс = якБиUTC - припущення; // на скільки Київ «попереду» цього наближення
  return припущення - зсувМс;
};
