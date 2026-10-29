// Чернетка картки клубу в кабінеті клубу (самообслуговування клубів, 2.1).
// Сервер — PUT/GET/DELETE crm/club/clubs/{id}/draft: він сам лишає в after
// лише змінені поля й перевіряє їх (xano/crm/club-clubs-id-draft.put.xs).
// Тут — поля форми, що показати «як буде після погодження» і статус.

// Поля ТЗ 2.1, які клуб пропонує змінити. Назву, турнір, материнський клуб і
// «актуальний» змінює лише АФУ — їх у формі немає.
export const ПОЛЯ_КАРТКИ = [
  { key: 'TeamInfo', label: 'Про клуб', kind: 'text', max: 2000 },
  { key: 'founded_year', label: 'Рік заснування', kind: 'year' },
  { key: 'home_venues_id', label: 'Домашня арена', kind: 'venue' },
  { key: 'website', label: 'Сайт', kind: 'url' },
  { key: 'instagram', label: 'Instagram', kind: 'url' },
  { key: 'facebook', label: 'Facebook', kind: 'url' },
  { key: 'youtube', label: 'YouTube', kind: 'url' },
  { key: 'kit_color_primary', label: 'Основний колір форми', kind: 'color' },
  { key: 'kit_color_secondary', label: 'Додатковий колір форми', kind: 'color' },
  { key: 'contact_name', label: 'Контактна особа', kind: 'contact' },
  { key: 'contact_phone', label: 'Телефон', kind: 'contact' },
  { key: 'contact_email', label: 'Пошта', kind: 'contact' },
];
export const ФОТО_КАРТКИ = [
  { key: 'TeamLogo', label: 'Емблема' },
  { key: 'TeamPhoto', label: 'Фото команди' },
];

const рядок = (v) => (v == null ? '' : String(v));

/** Значення форми: чинна картка, поверх — те, що вже є в чернетці. */
export function значенняФорми(картка, чернетка) {
  const після = чернетка?.after || {};
  const з = (k) => (k in після ? після[k] : картка?.[k]);
  const в = {};
  for (const { key } of ПОЛЯ_КАРТКИ) в[key] = рядок(з(key));
  for (const { key } of ФОТО_КАРТКИ) в[key] = з(key) || null;
  в.venue_suggestion = рядок(після.venue_suggestion);
  return в;
}

/** Тіло PUT: уся форма (сервер сам відбере змінене). */
export function тілоЧернетки(в) {
  const after = {};
  for (const { key } of ПОЛЯ_КАРТКИ) after[key] = рядок(в[key]).trim();
  for (const { key } of ФОТО_КАРТКИ) if (в[key]) after[key] = в[key];
  if (рядок(в.venue_suggestion).trim()) after.venue_suggestion = рядок(в.venue_suggestion).trim();
  return { after };
}

/** Що показати: чинна картка з поправками чернетки; змінені — окремим списком. */
export function якБуде(картка, чернетка) {
  const після = чернетка?.after || {};
  return { картка: { ...(картка || {}), ...після }, змінені: new Set(Object.keys(після)) };
}

export function статусЧернетки(чернетка) {
  if (!чернетка) return null;
  if (чернетка.status === 'submitted') return { тон: 'wait', текст: 'На погодженні АФУ — змінити можна після рішення або відкликавши пакет' };
  return { тон: 'draft', текст: 'Чернетка — ще не надіслано на погодження. На сайті й у застосунку поки старі дані' };
}

/** Перевірка до відправлення — ті самі правила, що на сервері, щоб підказати одразу. */
export function помилкиФорми(в, рік = new Date().getFullYear()) {
  const п = [];
  const t = (k) => рядок(в[k]).trim();
  if (t('TeamInfo').length > 2000) п.push('«Про клуб» — до 2000 знаків');
  if (t('founded_year') && !(/^\d{4}$/.test(t('founded_year')) && +t('founded_year') >= 1850 && +t('founded_year') <= рік)) п.push('Рік заснування — від 1850 до поточного');
  for (const k of ['website', 'instagram', 'facebook', 'youtube']) if (t(k) && !/^https?:\/\/\S+$/i.test(t(k))) п.push('Посилання на сайт і соцмережі мають починатися з https://');
  for (const k of ['kit_color_primary', 'kit_color_secondary']) if (t(k) && !/^#[0-9a-f]{6}$/i.test(t(k))) п.push('Колір форми — у вигляді #1A2B3C');
  if (t('contact_email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t('contact_email'))) п.push('Перевірте пошту контактної особи');
  return [...new Set(п)];
}
