import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { НЕЗАБИТИЙ, ЗАВЕРШЕННЯ, завершенняЗа, зПеріодами, незабитийБезТипу, періодЗа, підписХвилини, типНезабитогоЗа, типиНезабитого, хвилиниПеріоду } from './matchEvents.js';

const ГОЛИ = [
  { id: 1, Type: 'Звичайний' },
  { id: 2, Type: '(Автогол)' },
  { id: 3, Type: '(Пенальті)' },
  { id: 4, Type: '(Дабл пенальті)' },
];

test('«Не забитий»: лише «Пенальті» і «Дабл пенальті», без дужок', () => {
  assert.deepEqual(типиНезабитого(ГОЛИ), [{ id: 3, label: 'Пенальті' }, { id: 4, label: 'Дабл пенальті' }]);
  assert.deepEqual(типиНезабитого(undefined), []);
});

test('«Не забитий»: старий запис із 0 — без вибору; 3 / 4 — як є; інші події — без вибору', () => {
  assert.equal(типНезабитогоЗа({ types_of_match_events_id: НЕЗАБИТИЙ, types_of_goals_id: 0 }), '');
  assert.equal(типНезабитогоЗа({ types_of_match_events_id: НЕЗАБИТИЙ, types_of_goals_id: 4 }), '4');
  assert.equal(типНезабитогоЗа({ types_of_match_events_id: 1, types_of_goals_id: 3 }), '');
  assert.equal(типНезабитогоЗа(null), '');
  assert.equal(незабитийБезТипу({ types_of_match_events_id: НЕЗАБИТИЙ, types_of_goals_id: 0 }), true);
  assert.equal(незабитийБезТипу({ types_of_match_events_id: НЕЗАБИТИЙ, types_of_goals_id: 3 }), false);
  assert.equal(незабитийБезТипу({ types_of_match_events_id: 1, types_of_goals_id: 0 }), false);
});

// Сервер: та сама вимога при створенні й зміні події
const xs = (f) => fs.readFileSync(new URL(`../../xano/crm/${f}`, import.meta.url), 'utf8');
test('сервер: «Не забитий» лише з types_of_goals_id 3 або 4 — і при створенні, і при зміні', () => {
  assert.match(xs('matches-id-events.post.xs'), /precondition \(\$input\.types_of_match_events_id != 3 \|\| \$input\.types_of_goals_id == 3 \|\| \$input\.types_of_goals_id == 4\)/);
  for (const ф of ['matches-id-events.post.xs', 'events-id.patch.xs']) assert.match(xs(ф), /error = "Оберіть тип незабитого: пенальті чи дабл-пенальті"/, ф);
  const s = xs('events-id.patch.xs');
  const кінець = s.indexOf('} as $penalty_ok');
  const код = s.slice(s.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
  const ok = (was, input, raw) => new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'))({ was, raw }, input);
  // зміна хвилини в незабитому з типом — гаразд
  assert.equal(ok({ types_of_match_events_id: 3, types_of_goals_id: 4 }, { minute: 9 }, { minute: 9 }), true);
  // старий незабитий із 0: будь-яка зміна вимагає вказати тип
  assert.equal(ok({ types_of_match_events_id: 3, types_of_goals_id: 0 }, { minute: 9 }, { minute: 9 }), false);
  assert.equal(ok({ types_of_match_events_id: 3, types_of_goals_id: 0 }, { types_of_goals_id: 3 }, { types_of_goals_id: 3 }), true);
  // гол → незабитий без типу пенальті — ні
  assert.equal(ok({ types_of_match_events_id: 1, types_of_goals_id: 1 }, { types_of_match_events_id: 3 }, { types_of_match_events_id: 3 }), false);
  // інші події не чіпаються
  assert.equal(ok({ types_of_match_events_id: 2, types_of_goals_id: 0 }, { minute: 9 }, { minute: 9 }), true);
});

test('екстра-тайми: періоди за хвилиною — 1–40, 41–45, 46–50, 51', () => {
  assert.equal(періодЗа(1).key, 'main');
  assert.equal(періодЗа(40).key, 'main');
  assert.equal(періодЗа(41).key, 'et1');
  assert.equal(періодЗа(45).key, 'et1');
  assert.equal(періодЗа(46).key, 'et2');
  assert.equal(періодЗа('50').key, 'et2');
  assert.equal(періодЗа(51).key, 'pens');
  assert.equal(періодЗа('').key, 'main');
  assert.equal(періодЗа(1001).key, 'main'); // мітка штабу, не хвилина
  assert.deepEqual(хвилиниПеріоду('et1'), [41, 42, 43, 44, 45]);
  assert.deepEqual(хвилиниПеріоду('et2'), [46, 47, 48, 49, 50]);
  assert.deepEqual(хвилиниПеріоду('pens'), [51]);
});

test('екстра-тайми: підписи хвилин у протоколі', () => {
  assert.equal(підписХвилини(12), '12');
  assert.equal(підписХвилини(43), '43 · 1-й екстра-тайм');
  assert.equal(підписХвилини(48), '48 · 2-й екстра-тайм');
  assert.equal(підписХвилини(51), 'Серія пенальті');
  assert.equal(підписХвилини(null), '—');
});

test('екстра-тайми: вибір періоду — лише де продовження можливе або подія вже на 41–51', () => {
  assert.equal(зПеріодами({ can_extend: true }, null), true);
  assert.equal(зПеріодами({ can_extend: false }, null), false);
  assert.equal(зПеріодами({}, { minute: 12 }), false);
  assert.equal(зПеріодами({ can_extend: false }, { minute: 51 }), true);
});

test('завершення матчу: відоме значення — як є, решта (старі, порожні) — «Основний час»', () => {
  assert.deepEqual(ЗАВЕРШЕННЯ.map((f) => f.label), ['Основний час', 'Після екстра-таймів', 'По пенальті']);
  assert.equal(завершенняЗа({ finish: 'et' }), 'et');
  assert.equal(завершенняЗа({ finish: 'pens' }), 'pens');
  assert.equal(завершенняЗа({ finish: '' }), 'regular');
  assert.equal(завершенняЗа({}), 'regular');
  assert.equal(завершенняЗа(null), 'regular');
});
