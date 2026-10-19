#!/usr/bin/env node
/**
 * Нові рядки push_templates для статусів матчу (брифи match-postpone-after-start
 * і match-pause-and-note, 19.10). Функція «Push v2 match status» бере ці
 * шаблони за kind/tpl. Без рядка пуш однаково піде (текст із функції), але
 * тоді його не можна ні змінити, ні вимкнути на сторінці «Пуші».
 *
 *   node xano/push-templates-add.mjs --check   — лише показати
 *   node xano/push-templates-add.mjs           — додати відсутні; наявні не чіпає
 *
 * Відкат — видалити рядки (сторінка «Пуші» не видаляє, лише Xano).
 */
import { мета } from './meta.mjs';

const МАТЧ = '{home} — {away}';
export const РЯДКИ = [
  {
    kind: 'match_paused',
    label: 'Матч призупинено',
    title_template: МАТЧ,
    body_template: '⏸ Матч призупинено · {reason}',
    sort_order: 145,
    hint: 'Тим, хто стежить за командою, матчем чи гравцем, і темі «Наживо» — як «Матч почався». Статус «Призупинено»; {reason} — причина, яку бачать уболівальники',
  },
  {
    kind: 'match_resumed',
    label: 'Матч відновлено',
    title_template: МАТЧ,
    body_template: '▶️ Матч відновлено · {score}',
    sort_order: 147,
    hint: 'Тим самим, що й «Матч призупинено». «Призупинено» → «Онлайн»',
  },
  {
    kind: 'match_postponed_nodate',
    label: 'Матч перенесено, дата невідома',
    title_template: МАТЧ,
    body_template: '⏰ Матч перенесено · нову дату повідомимо',
    sort_order: 155,
    hint: 'Як «Матч перенесено», але коли час матчу вже минув: перенесли після початку чи без нової дати. Нову дату вболівальники отримають пушем «Змінено час»',
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const перевірка = process.argv.includes('--check');
  const таблиця = (await мета('GET', '/workspace/1/table?per_page=200')).items.find((t) => t.name === 'push_templates');
  if (!таблиця) throw new Error('таблиці push_templates немає');
  const наявні = (await мета('GET', `/workspace/1/table/${таблиця.id}/content?per_page=200`)).items;
  for (const р of РЯДКИ) {
    const є = наявні.find((r) => r.kind === р.kind);
    if (є) console.log(`вже є: #${є.id} ${р.kind} — не чіпаю`);
    else if (перевірка) console.log(`[перевірка] додав би ${р.kind} «${р.label}»`);
    else {
      const новий = await мета('POST', `/workspace/1/table/${таблиця.id}/content`, { ...р, enabled: true, created_at: Date.now(), updated_at: Date.now() });
      console.log(`додано #${новий.id} ${р.kind} «${новий.label}»`);
    }
  }
}
