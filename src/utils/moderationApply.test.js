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
  assert.deepEqual(п.steps, [{ table: 'TeamInfo', op: 'patch', id: 20, data: { TeamInfo: 'Нове' }, label: 'картку клубу змінено' }]);
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
});

test('зміна номера: основний — Team, додатковий — team_league', () => {
  assert.deepEqual(р({ entity: 'squad_row', action: 'update', entity_id: 100, leagues_id: 10, after: { Number: 8, Captain: true } }).steps[0], { table: 'Team', op: 'patch', id: 100, data: { Number: 8, Captain: true }, label: 'рядок складу змінено' });
  const з = { extra: [{ id: 8, team_id: 100, people_id: 1, teaminfo_id: 20, leagues_id: 12, Number: 17, is_active: true }] };
  assert.deepEqual(р({ entity: 'squad_row', action: 'update', entity_id: 100, leagues_id: 12, after: { Number: 18 } }, з).steps[0].data, { Number: 18 });
});

test('дані особи і штаб', () => {
  assert.deepEqual(р({ entity: 'person', action: 'update', entity_id: 1, after: { City: 'Львів' } }).steps, [{ table: 'People', op: 'patch', id: 1, data: { City: 'Львів' }, label: 'дані особи змінено' }]);
  assert.equal(р({ entity: 'person', action: 'update', entity_id: 1, after: { prizvushche: '' } }).failed, 'Прізвище не може бути порожнім');
  const додати = р({ entity: 'staff_row', action: 'create', people_id: 2, after: { positions_id: 5 } });
  assert.deepEqual(додати.steps[0].data, { people_id: 2, teaminfo_id: 20, positions_id: 5, leagues_id: null, Date: '2026-10-30', Relevance_of_the_record: true });
  assert.equal(р({ entity: 'staff_row', action: 'create', people_id: 1, after: { positions_id: 4 } }).failed, 'Ця особа вже на цій посаді в цьому клубі');
  assert.deepEqual(р({ entity: 'staff_row', action: 'update', entity_id: 200, after: { positions_id: 5 } }).steps[0].data, { positions_id: 5 });
  assert.deepEqual(р({ entity: 'staff_row', action: 'remove', entity_id: 200, after: { end_date: '2026-10-29' } }).steps[0].data, { Relevance_of_the_record: false, end_date: '2026-10-29' });
});

test('записи: CAS через has_decision; статус лише SQL-ом; особа перед рядками; збій — failed з переліком зробленого', () => {
  assert.match(xs, /WITH b AS \(\s*UPDATE x1_92 SET has_decision = true\s*WHERE id = \? AND status = 'submitted'\s*RETURNING id\s*\)\s*UPDATE x1_93 SET status = 'approved'\s*WHERE id = \? AND status = 'submitted' AND batch_id IN \(SELECT id FROM b\)/);
  assert.match(xs, /UPDATE x1_93 SET status = 'applied' WHERE id = \? AND status = 'approved' RETURNING id;/);
  for (const м of xs.matchAll(/db\.edit (change_request|change_batch) \{[\s\S]*?data = \{([^}]*)\}/g)) assert.doesNotMatch(м[2], /status/);
  assert.ok(xs.indexOf('db.add People {') < xs.indexOf('foreach ($steps)'));
  const tc = xs.indexOf('try_catch {', xs.indexOf('// 4б'));
  const ловимо = xs.slice(tc).search(/\n\s+catch \{/) + tc;
  assert.ok(tc < xs.indexOf('db.add People {') && ловимо > xs.indexOf('foreach ($steps)'), 'особа й кроки — всередині try');
  assert.match(xs, /Помилка запису в Xano посеред застосування\. Зроблено: /);
  // кожна таблиця кроку має свою гілку запису
  for (const [оп, т] of [['add', 'Team'], ['add', 'team_league'], ['add', 'Administration of teams'], ['patch', 'TeamInfo'], ['patch', 'People'], ['patch', 'Team'], ['patch', 'team_league'], ['patch', 'Administration of teams']]) {
    assert.ok(xs.includes(`if ($step.op == "${оп}" && $step.table == "${т}")`), `${оп} ${т}`);
  }
  assert.match(xs, /input = \{id_access_rights: 21, user_id: \$auth\.id\}/);
  assert.ok(xs.indexOf('id_access_rights: 21') < xs.indexOf('db.'));
});

test('id нової особи підставляється лише в кроки з person', () => {
  const підставити = лямбда('steps');
  const кроки = [{ table: 'Team', op: 'add', data: { player_id: -1, Number: 9 }, person: 'player_id' }, { table: 'Team', op: 'patch', id: 5, data: { x: 1 } }];
  assert.deepEqual(підставити({ plan: { steps: кроки }, new_person: 77 }, {}), [{ table: 'Team', op: 'add', data: { player_id: 77, Number: 9 }, person: 'player_id' }, кроки[1]]);
  assert.deepEqual(підставити({ plan: { steps: кроки }, new_person: null }, {}), кроки);
});

test('рецензія Backend 4.2: нову особу захоплює CAS до плану й db.add; план — у try_catch', () => {
  const захоплення = xs.indexOf("UPDATE x1_93 SET status = 'approved' WHERE id = ? AND status = 'submitted' RETURNING id;");
  assert.ok(захоплення > 0 && захоплення < xs.indexOf('db.add People {') && захоплення < xs.indexOf('} as $plan_try'));
  // особу захопив інший — рядок назад у submitted і 400 «спробуйте ще раз»
  assert.match(xs, /return !!б && б\.status === 'approved' && !\$var\.claimed;/);
  assert.match(xs, /error = "Нову особу саме створює інший модератор — спробуйте ще раз за хвилину"/);
  // особа applied лише з approved (нашого захоплення)
  assert.match(xs, /UPDATE x1_93 SET status = 'applied' WHERE id = \? AND status = 'approved' RETURNING id;\s*"""\s*response_type = "list"\s*arg = \$plan\.person\.request_id/);
  // план і HEAD — у try_catch; збій — план «не пройшов», а не 500 з approved назавжди
  const tc = xs.indexOf('try_catch {');
  assert.ok(tc < xs.indexOf('foreach ($image_paths)') && xs.indexOf('} as $plan_try') < xs.indexOf('} as $plan_crashed'));
  assert.match(xs, /Внутрішня помилка під час перевірки чи плану — повідомте Backend/);
  // захоплену, але не створену особу звільняють (план не пройшов не через неї; збій запису до db.add)
  assert.match(xs, /if \(\$claimed && \$plan\.person_failed == false\)/);
  assert.match(xs, /if \(\$claimed && \$new_person == null\)/);
});

test('особу саме створює інший модератор: лямбда розпізнає лише чуже захоплення', () => {
  const зайнято = лямбда('person_busy');
  assert.equal(зайнято({ parent_list: [{ status: 'approved' }], claimed: false }, {}), true);
  assert.equal(зайнято({ parent_list: [{ status: 'approved' }], claimed: true }, {}), false);
  assert.equal(зайнято({ parent_list: [{ status: 'applied' }], claimed: false }, {}), false);
  assert.equal(зайнято({ parent_list: [], claimed: false }, {}), false);
});
