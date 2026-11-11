import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// crm roster/add («Заявити гравця» в CRM АФУ): відмова через новішу чинну заявку в іншому клубі
// називає клуб, турнір і дату (питання Богдана 11.11, PM 2). Виконуємо саме лямбду з .xs.
const xs = fs.readFileSync(new URL('../../xano/crm/roster-add.post.xs', import.meta.url), 'utf8');
const кінець = xs.indexOf('} as $plan');
const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
const план = (v, input) => new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'))(v, input);

const база = (зміни = {}) => ({
  club: { id: 39, parent_teaminfo_id: 0 },
  relatives: [],
  active: [{ id: 1522, teaminfo_id: 106, Date: '2026-09-25', leagues_id: 12 }],
  club_names: [{ id: 39, TeamName: 'Сокіл' }, { id: 106, TeamName: 'Спартанс' }],
  league_names: [{ id: 12, League: 'BETKING Кубок України 2026/2027' }],
  ...зміни,
});

test('roster/add: новіша чинна заявка в іншому клубі — клуб, турнір і дата в тексті відмови', () => {
  const п = план(база(), { Date: '2026-09-01' });
  assert.equal(п.conflict.id, 1522);
  assert.equal(п.conflict_text, 'Гравець заявлений за Спартанс (BETKING Кубок України 2026/2027) з 25.09.2026. Нова дата має бути пізнішою, або спершу закрийте ту заявку');
  assert.match(xs, /precondition \(\$plan\.conflict == null\) \{\s*error_type = "badrequest"\s*error = \$plan\.conflict_text/);
});

test('roster/add: пізніша дата — не конфлікт, стара заявка закривається; без назв текст не падає', () => {
  const п = план(база(), { Date: '2026-11-11' });
  assert.equal(п.conflict, null);
  assert.equal(п.conflict_text, '');
  assert.deepEqual(п.close, [1522]);
  const б = план(база({ club_names: [], league_names: undefined }), { Date: '2026-09-25' });
  assert.equal(б.conflict_text, 'Гравець заявлений за інший клуб з 25.09.2026. Нова дата має бути пізнішою, або спершу закрийте ту заявку');
});
