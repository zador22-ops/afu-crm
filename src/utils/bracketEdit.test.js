import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Пари сітки на сервері: PATCH crm/bracket/{id} (#828) і POST tournaments/{id}/bracket (#507).
// Бай з будь-якого боку — бриф bracket-bye (17.11) і bracket-bye-team1 (19.11); живий текст Backend.
const xs = (f) => fs.readFileSync(new URL(`../../xano/crm/${f}`, import.meta.url), 'utf8');
const лямбда = (s, ім) => {
  const кін = s.indexOf(`} as $${ім}`);
  return s.slice(s.lastIndexOf('api.lambda {', кін), кін).match(/code = """([\s\S]*?)"""/)[1];
};
const p = xs('bracket-id.patch.xs');
const post = xs('tournaments-id-bracket.post.xs');
const команди = (input, pair) => new Function('ЗМІННІ_', 'ВХІД_', лямбда(p, 'teams').replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'))({ pair }, input);
const сторони = (input) => new Function('ВХІД_', лямбда(post, 'side2').replace(/\$input\./g, 'ВХІД_.'))(input);

test('PATCH пари: що не прийшло (чи 0 / null) — лишається; clear_teaminfo_id1/2 — бай з того боку; clear важить більше', () => {
  const пара = { teaminfo_id1: 10, teaminfo_id2: 20 };
  assert.deepEqual(команди({ teaminfo_id1: 30 }, пара), { t1: 30, t2: 20, q1: 30, q2: 20, need: 2 });
  assert.deepEqual(команди({ teaminfo_id1: 0, teaminfo_id2: null }, пара), { t1: 10, t2: 20, q1: 10, q2: 20, need: 2 });
  assert.deepEqual(команди({ clear_teaminfo_id2: true, teaminfo_id2: 40 }, пара), { t1: 10, t2: null, q1: 10, q2: -1, need: 1 });
  assert.deepEqual(команди({ clear_teaminfo_id1: true }, пара), { t1: null, t2: 20, q1: -1, q2: 20, need: 1 });
  // обидва clear — жодної команди: need 0, сервер відмовляє
  assert.equal(команди({ clear_teaminfo_id1: true, clear_teaminfo_id2: true }, пара).need, 0);
  // бай отримує суперника з порожнього боку
  assert.deepEqual(команди({ teaminfo_id1: 40 }, { teaminfo_id1: null, teaminfo_id2: 20 }), { t1: 40, t2: 20, q1: 40, q2: 20, need: 2 });
});

test('PATCH пари: право 9 першим кроком; хоча б одна команда; не сама з собою; учасників стільки, скільки команд; не зайнята в раунді', () => {
  const stack = p.slice(p.indexOf('stack {'));
  assert.match(stack.split('\n').slice(1).find((l) => l.trim()), /function\.run "Check access rights"/);
  assert.match(p, /id_access_rights: 9/);
  assert.match(p, /bool clear_teaminfo_id1\?/);
  assert.match(p, /bool clear_teaminfo_id2\?/);
  assert.match(p, /precondition \(\$teams\.need >= 1\)/);
  assert.match(p, /precondition \(\$teams\.need < 2 \|\| \$teams\.t1 != \$teams\.t2\)/);
  assert.match(p, /precondition \(\$participants == \$teams\.need\)/);
  assert.match(p, /\$db\.Bracket\.tours_id == \$pair\.tours_id && \$db\.Bracket\.id != \$input\.bracket_id/);
  assert.match(p, /precondition \(\$busy == 0\)/);
  assert.match(p, /data = \{teaminfo_id1: \$teams\.t1, teaminfo_id2: \$teams\.t2\}/);
});

test('POST пари: порожня з будь-якого боку — null, у пошуках -1; обидві порожні — need 0 (відмова)', () => {
  assert.deepEqual(сторони({ teaminfo_id1: 7 }), { t1: 7, t2: null, q1: 7, q2: -1, need: 1 });
  assert.deepEqual(сторони({ teaminfo_id2: 9 }), { t1: null, t2: 9, q1: -1, q2: 9, need: 1 });
  assert.deepEqual(сторони({ teaminfo_id1: 7, teaminfo_id2: 0 }), { t1: 7, t2: null, q1: 7, q2: -1, need: 1 });
  assert.deepEqual(сторони({ teaminfo_id1: 7, teaminfo_id2: 9 }), { t1: 7, t2: 9, q1: 7, q2: 9, need: 2 });
  assert.equal(сторони({}).need, 0);
});

test('POST пари: перевірки до запису — хоча б одна, не сама з собою, учасники, не зайнята в раунді', () => {
  assert.match(post, /precondition \(\$side2\.need >= 1\)/);
  assert.match(post, /precondition \(\$side2\.need < 2 \|\| \$side2\.t1 != \$side2\.t2\)/);
  assert.match(post, /precondition \(\$participants == \$side2\.need\)/);
  assert.ok(post.indexOf('precondition ($busy == 0)') < post.indexOf('db.add Bracket'));
  assert.match(post, /teaminfo_id1\s*: \$side2\.t1/);
  assert.match(post, /teaminfo_id2\s*: \$side2\.t2/);
});
