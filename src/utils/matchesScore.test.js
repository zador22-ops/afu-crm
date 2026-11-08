import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// crm/matches (список матчів у ADMIN): score і penalty, як у Default (R59, docs/xano/match-score-penalty.md)
const s = fs.readFileSync(new URL('../../xano/crm/matches.get.xs', import.meta.url), 'utf8');
const кінець = s.indexOf('} as $r59_out');
const код = s.slice(s.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
const run = (matches, r59_so, ce = {}) => new Function('ЗМІННІ_', код.replace(/\$var\./g, 'ЗМІННІ_.'))({ matches, r59_so, ...ce });

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

// can_extend (контракт Backend match-finish-contract): кубок або стадія-сітка; чогось бракує — false
const CE = {
  ce_leagues: [{ id: 10, league_id: 1 }, { id: 20, league_id: 2 }],
  ce_competitions: [{ id: 1, type: 'ліга' }, { id: 2, type: 'кубок' }, { id: 3, type: 'міжнародне' }],
  ce_tours: [{ id: 100, league_stage_id: 1 }, { id: 101, league_stage_id: 2 }],
  ce_stages: [{ id: 1, stage_type: 'таблиця' }, { id: 2, stage_type: 'сітка' }],
};
const МАТЧІ = [
  { id: 1, leagues_id: 10, tours_id: 100 }, // ліга, таблиця — false
  { id: 2, leagues_id: 10, tours_id: 101 }, // ліга, сітка (плей-оф) — true
  { id: 3, leagues_id: 20, tours_id: 100 }, // кубок, таблиця — true
  { id: 4, leagues_id: 10, tours_id: 0 }, // тур 0 — false
  { id: 5, leagues_id: 99, tours_id: 0 }, // змагання немає — false
];

test('crm/matches: can_extend — кубок або сітка, інакше false', () => {
  assert.deepEqual(run(МАТЧІ, [], CE).map((m) => m.can_extend), [false, true, true, false, false]);
  assert.deepEqual(run(МАТЧІ, []).map((m) => m.can_extend), [false, false, false, false, false]);
  assert.match(s, /where = \$db\.Leagues\.id == \$input\.leagues_id/);
});

test('crm/matches/{id}: can_extend за тим самим правилом, решта полів матчу без змін', () => {
  const x = fs.readFileSync(new URL('../../xano/crm/matches-id.get.xs', import.meta.url), 'utf8');
  const кін = x.indexOf('} as $ce_out');
  const к = x.slice(x.lastIndexOf('api.lambda {', кін), кін).match(/code = """([\s\S]*?)"""/)[1];
  const один = (match, ce = CE) => new Function('ЗМІННІ_', к.replace(/\$var\./g, 'ЗМІННІ_.'))({ match, ...ce });
  assert.deepEqual(МАТЧІ.map((m) => один(m).can_extend), [false, true, true, false, false]);
  const m = один({ id: 7, leagues_id: 20, tours_id: 101, awarded: false, _team1: { id: 1 } });
  assert.deepEqual(m, { id: 7, leagues_id: 20, tours_id: 101, awarded: false, _team1: { id: 1 }, can_extend: true });
  assert.match(x, /response = \$ce_out/);
  // правило в обох ендпоінтах однакове
  const правило = (t) => t.match(/const ліги = [\s\S]*?const продовження = [^\n]*/)[0];
  assert.equal(правило(x), правило(s));
});
