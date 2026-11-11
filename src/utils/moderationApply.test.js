import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 4.2 «Погодити» = застосувати: правила дослівно з AFU, план склейки CRM на фікстурах, форма записів
const ФАЙЛ = 'moderation-requests-id-approve.post.xs';
const xs = fs.readFileSync(new URL(`../../xano/crm/${ФАЙЛ}`, import.meta.url), 'utf8');
const лямбда = (ім) => {
  const кінець = xs.indexOf(`} as $${ім}`);
  const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
  return new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'));
};
// 30.10.2026 12:00 UTC = 14:00 Київ; «сьогодні» — 2026-10-30
const ЗАРАЗ = Date.UTC(2026, 9, 30, 12, 0);
const ДЕНЬ = 86400_000;
const план = (з) => {
  const справжній = Date.now;
  Date.now = () => ЗАРАЗ;
  try {
    return лямбда('plan')(з, {});
  } finally {
    Date.now = справжній;
  }
};

test('правила 4.2 у лямбді — дослівно з чернетки Backend (якщо репо AFU поруч)', (t) => {
  const оригінал = new URL('../../../AFU/docs/xano/drafts/club-self-service/apply-rules.js', import.meta.url);
  if (!fs.existsSync(оригінал)) return t.skip('репо AFU не поруч');
  const ор = fs.readFileSync(оригінал, 'utf8');
  const правила = ор.slice(0, ор.indexOf("if (typeof module !== 'undefined')")).trimEnd();
  const від = xs.indexOf('// ПРАВИЛА 4.2 — ДОСЛІВНО');
  const тіло = xs.slice(xs.indexOf('\n', від) + 1, xs.indexOf('        // /ПРАВИЛА 4.2')).trimEnd();
  assert.equal(тіло, правила);
});

// Клуб 20 (фарм 21), чужий 30. Турніри 10 (основний), 12 (кубок), 14 (лише в період — закритий)
const база = (зміни = {}) => ({
  clubs: [{ id: 20, TeamName: 'Сокіл', parent_teaminfo_id: null }, { id: 21, parent_teaminfo_id: 20 }, { id: 30, TeamName: 'Яструб' }, { id: 40, team_kind: 'national' }],
  people: [
    { id: 1, prizvushche: 'Свій', Name: 'Іван', Date_of_birth: '2000-01-01' },
    { id: 2, prizvushche: 'Чужий', Name: 'Петро', Date_of_birth: '1999-05-05' },
  ],
  cards: [
    { id: 100, player_id: 1, teaminfo_id: 20, leagues_id: 10, Number: 7, positions_id: 1, Date: '2026-09-01', Relevance_of_the_record: true },
    { id: 101, player_id: 2, teaminfo_id: 30, leagues_id: 10, Number: 4, positions_id: 1, Date: '2026-09-01', Relevance_of_the_record: true },
  ],
  extra: [{ id: 7, team_id: 101, people_id: 2, teaminfo_id: 30, leagues_id: 12, Number: 14, Date: '2026-09-05', is_active: true }],
  staff: [{ id: 200, people_id: 1, teaminfo_id: 20, positions_id: 4, Date: '2026-01-01', Relevance_of_the_record: true }],
  positions: [{ id: 1, Player_position: true }, { id: 2, Player_position: true }, { id: 4, Player_position: false }, { id: 5, Player_position: false }],
  windows: [],
  rules: [{ leagues_id: 14, window_only: true }],
  parent_list: [],
  images: [],
  ...зміни,
});
const р = (row, зміни) => план(база({ row: { teaminfo_id: 20, status: 'approved', ...row }, ...зміни }));

test('картка клубу: лише білий список; лише пропозиція арени — без запису', () => {
  const п = р({ entity: 'club', action: 'update', entity_id: 20, after: { TeamInfo: 'Нове', Relevance: false } });
  assert.equal(п.ok, true);
  assert.deepEqual(п.steps, [{ table: 'TeamInfo', op: 'patch', id: 20, data: { TeamInfo: 'Нове' }, label: 'картку клубу змінено', applied_id: 20 }]);
  assert.equal(п.applied_id, 20); // у журнал — id клубу (Backend, Г1)
  const а = р({ entity: 'club', action: 'update', entity_id: 20, after: { venue_suggestion: 'м. Суми' } });
  assert.equal(а.ok, true);
  assert.deepEqual(а.steps, []);
  assert.equal(а.venue_suggestion, 'м. Суми');
  assert.equal(р({ entity: 'club', action: 'update', entity_id: 20, after: { kit_color_primary: 'red' } }).failed, 'Колір форми має бути у форматі #RRGGBB');
});

test('фото: файла немає у vault — failed, нічого не пишеться', () => {
  const п = р({ entity: 'club', action: 'update', entity_id: 20, after: { TeamLogo: { path: '/vault/x.png' } } }, { images: [{ path: '/vault/x.png', status: 404 }] });
  assert.deepEqual([п.ok, п.failed, п.steps], [false, 'Файл зображення не знайдено — завантажте його знову', []]);
  assert.equal(р({ entity: 'club', action: 'update', entity_id: 20, after: { TeamLogo: { path: '/vault/x.png' } } }, { images: [{ path: '/vault/x.png', status: 200 }] }).ok, true);
});

test('нова особа + перший рядок складу: особа першою, рядок — Team з її id; дата — сьогодні за Києвом', () => {
  const батько = { id: 50, entity: 'person', action: 'create', status: 'submitted', after: { prizvushche: 'Новенко', Name: 'Іра', Date_of_birth: '2005-02-02' } };
  const п = р({ id: 51, entity: 'squad_row', action: 'create', depends_on_id: 50, leagues_id: 10, after: { Number: 9, positions_id: 1 } }, { parent_list: [батько] });
  assert.equal(п.ok, true, п.failed);
  assert.deepEqual(п.person, { data: { prizvushche: 'Новенко', Name: 'Іра', Date_of_birth: '2005-02-02' }, request_id: 50 });
  assert.equal(п.steps.length, 1);
  assert.deepEqual(п.steps[0].data, { player_id: -1, teaminfo_id: 20, leagues_id: 10, Number: 9, positions_id: 1, Captain: false, Date: '2026-10-30', Relevance_of_the_record: true });
  assert.equal(п.steps[0].person, 'player_id');
  assert.equal(п.today, '2026-10-30');
});

test('нова особа-двійник: рядок failed, особа і решта її рядків — теж (person_failed)', () => {
  const батько = { id: 50, entity: 'person', action: 'create', status: 'submitted', after: { prizvushche: 'свій', Name: 'Х', Date_of_birth: '2000-01-01' } };
  const п = р({ id: 51, entity: 'squad_row', action: 'create', depends_on_id: 50, leagues_id: 10, after: { Number: 9, positions_id: 1 } }, { parent_list: [батько] });
  assert.equal(п.ok, false);
  assert.match(п.failed, /Така особа вже є в базі \(id 1\)/);
  assert.equal(п.person_failed, true);
  assert.equal(п.person_request_id, 50);
  assert.equal(п.person, null);
});

test('другий рядок уже створеної нової особи (батько applied) — додатковий турнір team_league', () => {
  const батько = { id: 50, status: 'applied', applied_entity_id: 9 };
  const з = база({ people: [...база().people, { id: 9, prizvushche: 'Новенко', Name: 'Іра' }], cards: [...база().cards, { id: 102, player_id: 9, teaminfo_id: 20, leagues_id: 10, Number: 9, Relevance_of_the_record: true }], parent_list: [батько] });
  const п = план({ ...з, row: { id: 52, teaminfo_id: 20, status: 'approved', entity: 'squad_row', action: 'create', depends_on_id: 50, leagues_id: 12, after: { Number: 19, positions_id: 1 } } });
  assert.equal(п.ok, true, п.failed);
  assert.deepEqual(п.steps.map((к) => [к.table, к.op]), [['team_league', 'add']]);
  assert.deepEqual(п.steps[0].data, { team_id: 102, people_id: 9, teaminfo_id: 20, leagues_id: 12, Number: 19, Date: '2026-10-30', is_active: true });
  assert.equal(п.person, null);
});

test('перехід: спершу новий Team, потім закрити старий і його додаткові турніри', () => {
  const п = р({ entity: 'squad_row', action: 'transfer', people_id: 2, leagues_id: 10, transfer_from_team_id: 101, after: { Number: 11, positions_id: 1 } });
  assert.equal(п.ok, true, п.failed);
  assert.deepEqual(п.steps.map((к) => [к.table, к.op, к.id ?? null]), [['Team', 'add', null], ['Team', 'patch', 101], ['team_league', 'patch', 7]]);
  assert.deepEqual(п.steps[1].data, { Relevance_of_the_record: false, End_date: '2026-10-30' });
  assert.deepEqual(п.steps[2].data, { is_active: false, End_date: '2026-10-30' });
  assert.equal(п.steps[0].data.player_id, 2);
  // create замість transfer — правила відмовляють
  assert.equal(р({ entity: 'squad_row', action: 'create', people_id: 2, leagues_id: 10, after: { Number: 11, positions_id: 1 } }).failed, 'Гравець активний в іншому клубі — це перехід, а не нове додавання');
});

test('перехід, а в старому клубі заявка з сьогоднішньою чи пізнішою датою — клуб, турнір і дата в тексті', () => {
  const картки = база().cards.map((к) => (к.id === 101 ? { ...к, Date: '2026-10-30' } : к));
  const п = р(
    { entity: 'squad_row', action: 'transfer', people_id: 2, leagues_id: 10, transfer_from_team_id: 101, after: { Number: 11, positions_id: 1 } },
    { cards: картки, league_names: [{ id: 10, League: 'Екстра-ліга 2026/27' }] },
  );
  assert.equal(п.failed, 'Гравець заявлений за Яструб (Екстра-ліга 2026/27) з 30.10.2026 — не раніше за сьогодні. АФУ має спершу закрити ту заявку');
  assert.match(xs, /турніри: \$var\.league_names \|\| \[\]/);
});

test('закрите заявкове вікно, зайнятий номер, збірна — failed текстом правила', () => {
  assert.equal(р({ entity: 'squad_row', action: 'create', people_id: 2, leagues_id: 14, after: { Number: 11, positions_id: 1 } }).failed, 'Поза заявковим періодом турніру');
  const відкрите = { windows: [{ leagues_id: 14, starts_at: ЗАРАЗ - ДЕНЬ, ends_at: ЗАРАЗ + ДЕНЬ }] };
  assert.notEqual(р({ entity: 'squad_row', action: 'transfer', people_id: 2, leagues_id: 14, after: { Number: 11, positions_id: 1 } }, відкрите).failed, 'Поза заявковим періодом турніру');
  assert.equal(р({ entity: 'squad_row', action: 'transfer', people_id: 2, leagues_id: 10, after: { Number: 7, positions_id: 1 } }).failed, 'Номер 7 уже має інший гравець цього клубу в турнірі');
  assert.equal(план(база({ row: { teaminfo_id: 40, status: 'approved', entity: 'squad_row', action: 'create', people_id: 1, leagues_id: 10, after: { Number: 3, positions_id: 1 } } })).failed, 'Для збірних та іноземних клубів склад і штаб не ведуться');
});

test('виведення з основного, коли є додатковий: основним стає додатковий (patch Team) і той team_league вимикається', () => {
  const з = { extra: [{ id: 8, team_id: 100, people_id: 1, teaminfo_id: 20, leagues_id: 12, Number: 17, Date: '2026-09-10', is_active: true }] };
  const п = р({ entity: 'squad_row', action: 'remove', entity_id: 100, leagues_id: 10, after: { End_date: '2026-10-30' } }, з);
  assert.equal(п.ok, true, п.failed);
  assert.deepEqual(п.steps.map((к) => [к.table, к.id, к.data]), [
    ['Team', 100, { leagues_id: 12, Number: 17 }],
    ['team_league', 8, { is_active: false, End_date: '2026-10-30' }],
  ]);
  assert.equal(п.steps[0].label, 'основний турнір гравця змінено');
  // без додаткових — просто закрити Team
  assert.deepEqual(р({ entity: 'squad_row', action: 'remove', entity_id: 100, leagues_id: 10, after: { End_date: '2026-10-30' } }).steps[0].data, { Relevance_of_the_record: false, End_date: '2026-10-30' });
  assert.equal(р({ entity: 'squad_row', action: 'remove', entity_id: 100, leagues_id: 10, after: { End_date: '2026-11-05' } }).failed, 'Дата виведення не може бути в майбутньому');
  // у журнал — id рядка, що змінився (Backend, пакет #5): основний Team при зміні основного турніру
  assert.equal(р({ entity: 'squad_row', action: 'remove', entity_id: 100, leagues_id: 10, after: { End_date: '2026-10-30' } }, з).applied_id, 100);
});

test('зміна номера: основний — Team, додатковий — team_league', () => {
  assert.deepEqual(р({ entity: 'squad_row', action: 'update', entity_id: 100, leagues_id: 10, after: { Number: 8, Captain: true } }).steps[0], { table: 'Team', op: 'patch', id: 100, data: { Number: 8, Captain: true }, label: 'рядок складу змінено', applied_id: 100 });
  const з = { extra: [{ id: 8, team_id: 100, people_id: 1, teaminfo_id: 20, leagues_id: 12, Number: 17, is_active: true }] };
  assert.deepEqual(р({ entity: 'squad_row', action: 'update', entity_id: 100, leagues_id: 12, after: { Number: 18 } }, з).steps[0].data, { Number: 18 });
});

test('дані особи і штаб', () => {
  assert.deepEqual(р({ entity: 'person', action: 'update', entity_id: 1, after: { City: 'Львів' } }).steps, [{ table: 'People', op: 'patch', id: 1, data: { City: 'Львів' }, label: 'дані особи змінено', applied_id: 1 }]);
  assert.equal(р({ entity: 'person', action: 'update', entity_id: 1, after: { prizvushche: '' } }).failed, 'Прізвище не може бути порожнім');
  const додати = р({ entity: 'staff_row', action: 'create', people_id: 2, after: { positions_id: 5 } });
  assert.deepEqual(додати.steps[0].data, { people_id: 2, teaminfo_id: 20, positions_id: 5, leagues_id: null, Date: '2026-10-30', Relevance_of_the_record: true });
  assert.equal(р({ entity: 'staff_row', action: 'create', people_id: 1, after: { positions_id: 4 } }).failed, 'Ця особа вже на цій посаді в цьому клубі');
  assert.deepEqual(р({ entity: 'staff_row', action: 'update', entity_id: 200, after: { positions_id: 5 } }).steps[0].data, { positions_id: 5 });
  assert.deepEqual(р({ entity: 'staff_row', action: 'remove', entity_id: 200, after: { end_date: '2026-10-29' } }).steps[0].data, { Relevance_of_the_record: false, end_date: '2026-10-29' });
  assert.equal(р({ entity: 'staff_row', action: 'remove', entity_id: 200, after: { end_date: '2026-10-29' } }).applied_id, 200);
});


test('id нової особи підставляється лише в кроки з person', () => {
  const підставити = лямбда('steps');
  const кроки = [{ table: 'Team', op: 'add', data: { player_id: -1, Number: 9 }, person: 'player_id' }, { table: 'Team', op: 'patch', id: 5, data: { x: 1 } }];
  // add-крок — усі ключі таблиці (db.add у Xano не бере змінну як data — поля явні; відсутній ключ дав би 500)
  const повний = (д) => ({ player_id: null, teaminfo_id: null, leagues_id: null, Number: null, positions_id: null, Captain: null, Date: null, Relevance_of_the_record: null, ...д });
  assert.deepEqual(підставити({ plan: { steps: кроки }, new_person: 77 }, {}), [{ table: 'Team', op: 'add', data: повний({ player_id: 77, Number: 9 }), person: 'player_id' }, кроки[1]]);
  assert.deepEqual(підставити({ plan: { steps: кроки }, new_person: null }, {}), [{ ...кроки[0], data: повний({ player_id: -1, Number: 9 }) }, кроки[1]]);
  // явні поля в db.add; patch — через змінну верхнього рівня (як governing-bodies-id.patch)
  assert.doesNotMatch(xs, /data = \$step\.data|data = \$plan\.person\.data/);
  assert.match(xs, /db\.add Team \{\s*data = \{player_id: \$step\.data\.player_id, /);
  assert.match(xs, /db\.add People \{\s*data = \{prizvushche: \$person_data\.prizvushche, /);
});



