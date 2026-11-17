import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// PATCH crm/bracket/{id} — заміна команд уже створеної пари (бриф crm-bracket-editor, п. 2)
const xs = (f) => fs.readFileSync(new URL(`../../xano/crm/${f}`, import.meta.url), 'utf8');
const p = xs('bracket-id.patch.xs');
const кінець = p.indexOf('} as $teams');
const код = p.slice(p.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
const команди = (input, pair) => new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'))({ pair }, input);

test('PATCH пари: що не прийшло — лишається; 0 і порожнє — «не чіпати»; clear_teaminfo_id2 — бай (bracket-bye)', () => {
  const пара = { teaminfo_id1: 10, teaminfo_id2: 20 };
  assert.deepEqual(команди({ teaminfo_id1: 30 }, пара), { t1: 30, t2: 20, q2: 20, need: 2 });
  assert.deepEqual(команди({ teaminfo_id2: 40 }, пара), { t1: 10, t2: 40, q2: 40, need: 2 });
  assert.deepEqual(команди({ teaminfo_id1: 0, teaminfo_id2: null }, пара), { t1: 10, t2: 20, q2: 20, need: 2 });
  // прибрати суперника: друга — null, у пошуках -1 (не збігається з іншими баями), учасник один
  assert.deepEqual(команди({ clear_teaminfo_id2: true }, пара), { t1: 10, t2: null, q2: -1, need: 1 });
  assert.deepEqual(команди({ clear_teaminfo_id2: true, teaminfo_id2: 40 }, пара), { t1: 10, t2: null, q2: -1, need: 1 }); // clear важить більше
  // бай отримує суперника
  assert.deepEqual(команди({ teaminfo_id2: 40 }, { teaminfo_id1: 10, teaminfo_id2: null }), { t1: 10, t2: 40, q2: 40, need: 2 });
});

test('PATCH пари: право 9 першим кроком, учасників стільки, скільки команд, не сама з собою, не зайнята в іншій парі раунду', () => {
  const stack = p.slice(p.indexOf('stack {'));
  assert.match(stack.split('\n').slice(1).find((l) => l.trim()), /function\.run "Check access rights"/);
  assert.match(p, /id_access_rights: 9/);
  assert.match(p, /bool clear_teaminfo_id2\?/);
  assert.match(p, /precondition \(\$teams\.t1 != \$teams\.t2\)/);
  assert.match(p, /precondition \(\$teams\.t1 != null && \$participants == \$teams\.need\)/);
  assert.match(p, /\$db\.Bracket\.tours_id == \$pair\.tours_id && \$db\.Bracket\.id != \$input\.bracket_id/);
  assert.match(p, /precondition \(\$busy == 0\)/);
  assert.match(p, /data = \{teaminfo_id1: \$teams\.t1, teaminfo_id2: \$teams\.t2\}/);
});

test('POST пари: та сама перевірка «вже в іншій парі цього раунду» до запису', () => {
  const s = xs('tournaments-id-bracket.post.xs');
  assert.match(s, /\$db\.Bracket\.tours_id == \$input\.tours_id && \(\$db\.Bracket\.teaminfo_id1 == \$input\.teaminfo_id1/);
  assert.ok(s.indexOf('precondition ($busy == 0)') < s.indexOf('db.add Bracket'));
});

test('POST пари: бай — без teaminfo_id2 (чи 0) друга команда null, у пошуках -1, учасник один (bracket-bye)', () => {
  const s = xs('tournaments-id-bracket.post.xs');
  const кін = s.indexOf('} as $side2');
  const к = s.slice(s.lastIndexOf('api.lambda {', кін), кін).match(/code = """([\s\S]*?)"""/)[1];
  const бік = (input) => new Function('ВХІД_', к.replace(/\$input\./g, 'ВХІД_.'))(input);
  assert.deepEqual(бік({ teaminfo_id1: 7 }), { t2: null, q2: -1, need: 1 });
  assert.deepEqual(бік({ teaminfo_id1: 7, teaminfo_id2: 0 }), { t2: null, q2: -1, need: 1 });
  assert.deepEqual(бік({ teaminfo_id1: 7, teaminfo_id2: 9 }), { t2: 9, q2: 9, need: 2 });
});
