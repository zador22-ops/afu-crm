#!/usr/bin/env node
/**
 * Рядок push_templates «match_postponed_nodate» — «Матч перенесено» без дати
 * (бриф match-postpone-after-start, 19.10). Функція «Push v2 match status»
 * бере цей шаблон, коли час матчу вже минув: матч перенесли після початку чи
 * без нової дати. Без рядка пуш однаково піде (текст із функції), але тоді
 * його не можна ні змінити, ні вимкнути на сторінці «Пуші».
 *
 *   node xano/push-template-postponed-nodate.mjs --check   — лише показати
 *   node xano/push-template-postponed-nodate.mjs           — додати, якщо нема
 *
 * Відкат — видалити рядок (сторінка «Пуші» не видаляє, лише Xano).
 */
import { мета } from './meta.mjs';

const РЯДОК = {
  kind: 'match_postponed_nodate',
  label: 'Матч перенесено, дата невідома',
  title_template: '{home} — {away}',
  body_template: '⏰ Матч перенесено · нову дату повідомимо',
  enabled: true,
  sort_order: 155,
  hint: 'Як «Матч перенесено», але коли час матчу вже минув: перенесли після початку чи без нової дати. Нову дату вболівальники отримають пушем «Змінено час»',
};

const перевірка = process.argv.includes('--check');
const таблиця = (await мета('GET', '/workspace/1/table?per_page=200')).items.find((t) => t.name === 'push_templates');
if (!таблиця) throw new Error('таблиці push_templates немає');
const рядки = (await мета('GET', `/workspace/1/table/${таблиця.id}/content?per_page=200`)).items;
const є = рядки.find((r) => r.kind === РЯДОК.kind);
if (є) {
  console.log(`вже є: #${є.id} «${є.label}» — нічого не роблю`);
} else if (перевірка) {
  console.log(`[перевірка] додав би «${РЯДОК.label}» у push_templates #${таблиця.id}`);
} else {
  const новий = await мета('POST', `/workspace/1/table/${таблиця.id}/content`, { ...РЯДОК, created_at: Date.now(), updated_at: Date.now() });
  console.log(`додано #${новий.id} «${новий.label}»`);
}
