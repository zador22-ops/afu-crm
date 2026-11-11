// «Погодження» заявок клубів (самообслуговування клубів, 4.1)
import { ПОЛЯ_КАРТКИ, ФОТО_КАРТКИ } from './clubDraft.js';

const ПОЛЯ = {
  club: [
    ...ФОТО_КАРТКИ.map((п) => ({ ...п, kind: 'image' })),
    ...ПОЛЯ_КАРТКИ,
    { key: 'venue_suggestion', label: 'Запропонована арена', kind: 'text' },
  ],
  person: [
    { key: 'Photo', label: 'Фото', kind: 'image' },
    { key: 'prizvushche', label: 'Прізвище', kind: 'text' },
    { key: 'Name', label: "Ім'я", kind: 'text' },
    { key: 'po_batkovi', label: 'По батькові', kind: 'text' },
    { key: 'Date_of_birth', label: 'Дата народження', kind: 'date' },
    { key: 'City', label: 'Місто', kind: 'text' },
    { key: 'Growth', label: 'Зріст, см', kind: 'text' },
    { key: 'Weight', label: 'Вага, кг', kind: 'text' },
  ],
  squad_row: [
    { key: 'Number', label: 'Номер', kind: 'text' },
    { key: 'positions_id', label: 'Позиція', kind: 'position' },
    { key: 'Captain', label: 'Капітан', kind: 'bool' },
    { key: 'End_date', label: 'Дата виведення', kind: 'date' },
  ],
  staff_row: [
    { key: 'positions_id', label: 'Посада', kind: 'position' },
    { key: 'end_date', label: 'Дата виведення', kind: 'date' },
  ],
};

const ДІЇ = {
  'club.update': 'Картка клубу',
  'person.create': 'Нова особа',
  'person.update': 'Дані особи',
  'squad_row.create': 'Додати до складу',
  'squad_row.transfer': 'Перехід до складу',
  'squad_row.update': 'Зміна в складі',
  'squad_row.remove': 'Вивести зі складу',
  'staff_row.create': 'Додати до штабу',
  'staff_row.update': 'Зміна посади',
  'staff_row.remove': 'Вивести зі штабу',
};

export const СТАТУСИ = {
  submitted: { текст: 'чекає рішення', тон: 'wait' },
  approved: { текст: 'погоджено', тон: 'wait' },
  applied: { текст: 'застосовано', тон: 'ok' },
  rejected: { текст: 'повернуто', тон: 'bad' },
  failed: { текст: 'не застосовано', тон: 'bad' },
};

export const назваДії = (r) => ДІЇ[`${r.entity}.${r.action}`] || `${r.entity}.${r.action}`;

/** Значення поля для показу: посилання — назвою, так/ні, дата без часу; зображення лишається об'єктом. */
export function показ(поле, v, labels = {}) {
  if (v == null || v === '') return null;
  if (поле.kind === 'image') return v;
  if (поле.kind === 'position') return labels.positions?.[v] || `№${v}`;
  if (поле.kind === 'venue') return labels.venues?.[v] || `арена №${v}`;
  if (поле.kind === 'bool') return v ? 'так' : 'ні';
  if (поле.kind === 'date') return String(v).slice(0, 10);
  return String(v);
}

/**
 * Рядки «було / стане» однієї заявки: лише поля з after (і before, якщо є) у порядку білого списку.
 * Для create «було» порожнє. Поля поза білим списком не показуються — їх і не застосують (контракт 4.2).
 */
export function порівняння(r, labels) {
  const поля = ПОЛЯ[r.entity] || [];
  const ключі = new Set([...Object.keys(r.after || {}), ...Object.keys(r.before || {})]);
  return поля
    .filter((п) => ключі.has(п.key))
    .map((п) => ({ key: п.key, label: п.label, kind: п.kind, before: показ(п, r.before?.[п.key], labels), after: показ(п, r.after?.[п.key], labels) }));
}

/**
 * Що робити АФУ, коли перехід не застосувався за правилом (приймання PM 1, 05.11). Рядок уже failed —
 * клуб подає гравця заново. null — підказки немає.
 */
export function підказкаНевдачі(r) {
  const т = String(r?.apply_error || '');
  const звідки = r?.transfer_from_name ? `«${r.transfer_from_name}»` : 'старому клубі';
  // Старий текст (до 11.11) і новий — з назвою клубу, турніру й датою
  if (/чинна заявка в іншому клубі з датою не раніше|не раніше за сьогодні\. АФУ має спершу закрити ту заявку/.test(т))
    return `Що зробити: у ${звідки} закрийте заявку гравця (Клуби → ${r?.transfer_from_name || 'клуб'} → Склад → «Закрити»), потім клуб подає гравця ще раз — уже як звичайне додавання.`;
  if (/Перехід, але чинної заявки в іншому клубі вже немає/.test(т)) return 'Що зробити: клуб подає гравця ще раз — уже як звичайне додавання (заявку в старому клубі закрито).';
  if (/Гравець активний в іншому клубі — це перехід/.test(т)) return 'Що зробити: клуб подає гравця ще раз — система сама оформить перехід.';
  return null;
}
