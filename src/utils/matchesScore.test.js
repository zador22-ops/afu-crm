import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// crm/matches (список матчів у ADMIN): score і penalty, як у Default (R59, docs/xano/match-score-penalty.md)
const s = fs.readFileSync(new URL('../../xano/crm/matches.get.xs', import.meta.url), 'utf8');
const кінець = s.indexOf('} as $r59_out');
const код = s.slice(s.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
const run = (matches, r59_so) => new Function('ЗМІННІ_', код.replace(/\$var\./g, 'ЗМІННІ_.'))({ matches, r59_so });

test('crm/matches: score без серії, penalty окремо; наявні поля без змін', () => {
  const матч = { id: 319, team1_id: 37, team2_id: 43, Result_team1: 7, Result_team2: 8, _team1: { id: 37 } };
  const [m] = run([матч], [
    { match_id: 319, teaminfo_id: 37, n: 4 },
    { match_id: 319, teaminfo_id: 43, n: '5' },
  ]);
  assert.deepEqual(m.score, [3, 3]);
  assert.deepEqual(m.penalty, [4, 5]);
  assert.equal(m.Result_team1, 7);
  assert.equal(m.Result_team2, 8);
  assert.deepEqual(m._team1, { id: 37 });
  assert.equal(матч.score, undefined, 'вхід не змінюється');
});

test('crm/matches: без серії — score = Result, penalty null; без рахунку — score null', () => {
  const [зіграний, майбутній] = run(
    [
      { id: 509, team1_id: 1, team2_id: 2, Result_team1: 1, Result_team2: 5 },
      { id: 600, team1_id: 1, team2_id: 2, Result_team1: null, Result_team2: null },
    ],
    [{ match_id: 319, teaminfo_id: 37, n: 4 }],
  );
  assert.deepEqual(зіграний.score, [1, 5]);
  assert.equal(зіграний.penalty, null);
  assert.equal(майбутній.score, null);
  assert.equal(майбутній.penalty, null);
});

test('crm/matches: серія лише однієї команди — у другої 0; порожній список', () => {
  const [m] = run([{ id: 7, team1_id: 1, team2_id: 2, Result_team1: 3, Result_team2: 2 }], [{ match_id: 7, teaminfo_id: 1, n: 2 }]);
  assert.deepEqual(m.score, [1, 2]);
  assert.deepEqual(m.penalty, [2, 0]);
  assert.deepEqual(run([], []), []);
  assert.deepEqual(run(undefined, undefined), []);
});

test('crm/matches: відповідь — результат лямбди, а SQL той самий, що в Default', () => {
  assert.match(s, /response = \$r59_out/);
  assert.match(s, /WHERE s\.minute = 51 AND s\.types_of_match_events_id = 1/);
});
