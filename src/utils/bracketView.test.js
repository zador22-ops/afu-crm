import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { розкластиСітку } from './bracketLayout.js';
import { рахунокМатчу, станПари, стадіїСітки } from './bracketView.js';

// Сітка в CRM має виглядати так само, як у застосунку (бриф crm-bracket-editor): розкладка — та сама функція
test('розкладка сітки — дослівно AFU utils/bracketLayout.js (якщо репо AFU поруч)', (t) => {
  const оригінал = new URL('../../../AFU/utils/bracketLayout.js', import.meta.url);
  if (!fs.existsSync(оригінал)) return t.skip('репо AFU не поруч');
  assert.equal(fs.readFileSync(new URL('./bracketLayout.js', import.meta.url), 'utf8'), fs.readFileSync(оригінал, 'utf8'));
});

test('етапи «сітка»: раунди групуються за етапом у порядку турів, інші етапи — поза сіткою', () => {
  const tours = [
    { id: 1, league_stage_id: 1, _stage: { stage_type: 'таблиця', stage_name: 'Регулярка' } },
    { id: 55, league_stage_id: 2, _stage: { stage_type: 'сітка', stage_name: 'Плей-оф' } },
    { id: 56, league_stage_id: 2, _stage: { stage_type: 'сітка', stage_name: 'Плей-оф' } },
    { id: 60, league_stage_id: 3, _stage: { stage_type: 'сітка', stage_name: '' } },
  ];
  assert.deepEqual(
    стадіїСітки(tours).map((с) => [с.id, с.назва, с.раунди.map((р) => р.id)]),
    [
      [2, 'Плей-оф', [55, 56]],
      [3, 'Плей-оф', [60]],
    ],
  );
  assert.deepEqual(стадіїСітки(undefined), []);
});

test('стан пари: матчів немає / не зіграний / частково / усе зіграно', () => {
  assert.equal(станПари({}), 'матчу ще немає');
  assert.equal(станПари({ legs: [{ match_status_id: 1 }] }), 'матч призначено, не зіграний');
  assert.equal(станПари({ legs: [{ match_status_id: 4 }, { match_status_id: 1 }] }), 'зіграно 1 з 2');
  assert.equal(станПари({ legs: [{ match_status_id: 4 }, { match_status_id: 5 }] }), 'зіграно 1 з 2'); // призупинений — ще не зіграний
  assert.equal(станПари({ legs: [{ match_status_id: 4 }, { match_status_id: '4' }] }), null);
});

test('рахунок матчу пари — в орієнтації пари, серія пенальті окремо', () => {
  assert.equal(рахунокМатчу({ match_status_id: 4, score: [3, 1], penalty: null }), '3:1');
  assert.equal(рахунокМатчу({ match_status_id: 4, score: [2, 2], penalty: [4, 5] }), '2:2 (пен. 4:5)');
  assert.equal(рахунокМатчу({ match_status_id: 3, score: [1, 0] }), null);
});

test('дерево з живої відповіді Default (ЕЛ 2024/25): три колонки й «За 3 місце» — як у застосунку', () => {
  const пара = (id, tours_id, a, b, r1, r2) => ({ id, tours_id, teaminfo_id1: a, teaminfo_id2: b, result_team1: r1, result_team2: r2, kind: 'series', _teaminfo1: { TeamName: `К${a}` }, _teaminfo2: { TeamName: `К${b}` } });
  const р = розкластиСітку({
    tours: [{ id: 55, TourName: '1/4' }, { id: 56, TourName: '1/2' }, { id: 57, TourName: 'Фінал' }, { id: 58, TourName: 'За 3 місце' }],
    bracket: [
      пара(1, 55, 1, 2, 3, 0), пара(2, 55, 3, 4, 3, 1), пара(3, 55, 5, 6, 3, 2), пара(4, 55, 7, 8, 3, 0),
      пара(5, 56, 1, 3, 3, 1), пара(6, 56, 5, 7, 3, 2),
      пара(7, 57, 1, 5, 3, 1),
      пара(8, 58, 3, 7, 3, 0),
    ],
  });
  assert.deepEqual(р.колонки.map((к) => [к.назва, к.пари.map((п) => п?.id ?? null)]), [['1/4', [1, 2, 3, 4]], ['1/2', [5, 6]], ['Фінал', [7]]]);
  assert.equal(р.заТретє.пара.id, 8);
});
