import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// PATCH crm/bracket/{id} — заміна команд уже створеної пари (бриф crm-bracket-editor, п. 2)
const xs = (f) => fs.readFileSync(new URL(`../../xano/crm/${f}`, import.meta.url), 'utf8');
const p = xs('bracket-id.patch.xs');
const кінець = p.indexOf('} as $teams');
const код = p.slice(p.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
const команди = (input, pair) => new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'))({ pair }, input);

test('PATCH пари: що не прийшло — лишається; 0 і порожнє — теж «не змінювати»', () => {
  const пара = { teaminfo_id1: 10, teaminfo_id2: 20 };
  assert.deepEqual(команди({ teaminfo_id1: 30 }, пара), { t1: 30, t2: 20 });
  assert.deepEqual(команди({ teaminfo_id2: 40 }, пара), { t1: 10, t2: 40 });
  assert.deepEqual(команди({ teaminfo_id1: 30, teaminfo_id2: 40 }, пара), { t1: 30, t2: 40 });
  assert.deepEqual(команди({ teaminfo_id1: 0, teaminfo_id2: null }, пара), { t1: 10, t2: 20 });
});

test('PATCH пари: право 9 першим кроком, учасники турніру, не сама з собою, не зайнята в іншій парі раунду', () => {
  const stack = p.slice(p.indexOf('stack {'));
  assert.match(stack.split('\n').slice(1).find((l) => l.trim()), /function\.run "Check access rights"/);
  assert.match(p, /id_access_rights: 9/);
  assert.match(p, /precondition \(\$teams\.t1 != \$teams\.t2\)/);
  assert.match(p, /precondition \(\$participants == 2\)/);
  assert.match(p, /\$db\.Bracket\.tours_id == \$pair\.tours_id && \$db\.Bracket\.id != \$input\.bracket_id/);
  assert.match(p, /precondition \(\$busy == 0\)/);
  assert.match(p, /data = \{teaminfo_id1: \$teams\.t1, teaminfo_id2: \$teams\.t2\}/);
});

test('POST пари: та сама перевірка «вже в іншій парі цього раунду» до запису', () => {
  const s = xs('tournaments-id-bracket.post.xs');
  assert.match(s, /\$db\.Bracket\.tours_id == \$input\.tours_id && \(\$db\.Bracket\.teaminfo_id1 == \$input\.teaminfo_id1/);
  assert.ok(s.indexOf('precondition ($busy == 0)') < s.indexOf('db.add Bracket'));
});
