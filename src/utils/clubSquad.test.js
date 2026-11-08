import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Лямбди 3.1 з самих .xs ($var / $input → фікстури, фіксоване «зараз»)
const лямбда = (файл, ім) => {
  const xs = fs.readFileSync(new URL(`../../xano/crm/${файл}`, import.meta.url), 'utf8');
  const кінець = xs.indexOf(`} as $${ім}`);
  const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
  const f = new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'));
  return (з, в) => {
    const справжній = Date.now;
    Date.now = () => ЗАРАЗ;
    try {
      return f(з, в);
    } finally {
      Date.now = справжній;
    }
  };
};
const ЗАРАЗ = Date.UTC(2026, 9, 30, 12, 0);
const ДЕНЬ = 86400_000;

// Клуб 20 (фарм 21 — дочірній), чужий клуб 30. Турніри сезону 3: 10 (ліга), 12 (кубок, лише у вікні — закрите)
const база = () => ({
  seasons: [{ id: 3, is_current: true }],
  leagues: [
    { id: 10, League: 'Екстра-ліга', season_id: 3 },
    { id: 12, League: 'Кубок', season_id: 3 },
    { id: 9, League: 'Минулий сезон', season_id: 2 },
  ],
  participants: [{ leagues_id: 10 }, { leagues_id: 12 }, { leagues_id: 9 }],
  windows: [{ leagues_id: 12, starts_at: ЗАРАЗ + 5 * ДЕНЬ, ends_at: ЗАРАЗ + 9 * ДЕНЬ }],
  rules: [{ leagues_id: 12, window_only: true }],
  cards: [
    { id: 100, player_id: 1, teaminfo_id: 20, leagues_id: 10, Number: 7, positions_id: 1, Relevance_of_the_record: true },
    { id: 101, player_id: 2, teaminfo_id: 30, leagues_id: 10, Number: 4, positions_id: 1, Relevance_of_the_record: true }, // чужий клуб
    { id: 102, player_id: 3, teaminfo_id: 21, leagues_id: 10, Number: 5, positions_id: 2, Relevance_of_the_record: true }, // фарм
    { id: 103, player_id: 4, teaminfo_id: 20, leagues_id: 10, Number: 9, positions_id: 1, Relevance_of_the_record: false }, // виведений
  ],
  people: [
    { id: 1, prizvushche: 'Свій', Name: 'Іван', Date_of_birth: '2000-01-01' },
    { id: 2, prizvushche: 'Чужий', Name: 'Петро', Date_of_birth: '1999-05-05' },
    { id: 3, prizvushche: 'Фармів', Name: 'Олег', Date_of_birth: '2003-03-03' },
    { id: 4, prizvushche: 'Колишній', Name: 'Ян', Date_of_birth: '1998-08-08' },
  ],
  clubs: [{ id: 20, parent_teaminfo_id: null }, { id: 21, parent_teaminfo_id: 20 }, { id: 30, parent_teaminfo_id: null }],
  positions: [{ id: 1, Position: 'Універсал', Player_position: true }, { id: 2, Position: 'Воротар', Player_position: true }, { id: 4, Position: 'Головний тренер', Player_position: false }],
  open: [],
  extra: [],
  requests: [],
  teams: [{ id: 20, TeamName: 'Сокіл' }, { id: 30, TeamName: 'Яструб' }],
});
const план = лямбда('club-clubs-id-players.post.xs', 'plan');
const додати = (person, rows, змінити = (x) => x) => план(змінити(база()), { teaminfo_id: 20, person, rows });

test('склад: турніри сезону клубу з вікнами; чинні гравці; нові з заявок', () => {
  const склад = лямбда('club-clubs-id-squad.get.xs', 'squad');
  const з = база();
  з.cards = з.cards.filter((k) => k.teaminfo_id === 20);
  з.requests = [
    { id: 50, entity: 'person', action: 'create', after: { prizvushche: 'Новенко', Name: 'Петро' }, status: 'draft' },
    { id: 51, entity: 'squad_row', action: 'create', depends_on_id: 50, leagues_id: 10, after: { Number: 11, positions_id: 2 }, status: 'draft' },
    { id: 52, entity: 'squad_row', action: 'remove', entity_id: 100, leagues_id: 10, after: { End_date: '2026-11-01' }, status: 'submitted' },
    { id: 53, entity: 'person', action: 'update', entity_id: 1, after: { City: 'Львів' }, status: 'draft' },
  ];
  const r = склад(з, { teaminfo_id: 20 });
  assert.deepEqual(r.tournaments.map((t) => [t.id, t.window_open, t.next_window_at]), [[10, true, null], [12, false, ЗАРАЗ + 5 * ДЕНЬ]]);
  assert.deepEqual(r.positions, [{ id: 1, name: 'Універсал' }, { id: 2, name: 'Воротар' }]);
  assert.deepEqual(r.players.map((p) => [p.team_id, p.name, p.request && p.request.action]), [[100, 'Свій Іван', 'remove']]);
  assert.deepEqual(r.players[0].person_request, { id: 53, status: 'draft', after: { City: 'Львів' } });
  assert.equal(r.players[0].prizvushche, 'Свій');
  assert.deepEqual(r.pending.map((p) => [p.request_id, p.name, p.new_person, p.Number, p.position]), [[51, 'Новенко Петро', true, 11, 'Воротар']]);
});

test('додати наявну особу: create; номер і позиція — на турнір', () => {
  const r = додати({ people_id: 4 }, [{ leagues_id: 10, Number: 12, positions_id: 1 }]);
  assert.equal(Object.entries(r).filter(([k, v]) => k.endsWith('_ok') && !v).length, 0, JSON.stringify(r));
  assert.deepEqual(r.rows, [{ leagues_id: 10, action: 'create', transfer_from_team_id: null, transfer_from_teaminfo_id: null, after: { Number: 12, positions_id: 1, Captain: false } }]);
});

test('перехід: активний в іншому клубі → transfer; фарм-клуб — ні', () => {
  const r = додати({ people_id: 2 }, [{ leagues_id: 10, Number: 13, positions_id: 1 }]);
  assert.equal(r.rows[0].action, 'transfer');
  assert.equal(r.rows[0].transfer_from_team_id, 101);
  assert.equal(r.rows[0].transfer_from_teaminfo_id, 30);
  assert.equal(додати({ people_id: 3 }, [{ leagues_id: 10, Number: 14, positions_id: 2 }]).rows[0].action, 'create');
});

test('нова особа: обовʼязкові ПІБ і дата; дубль — відмова; поля перевіряються', () => {
  const нова = { prizvushche: 'Новенко', Name: 'Петро', Date_of_birth: '2005-02-02', Growth: '180', City: 'Київ' };
  const r = додати({ new: нова }, [{ leagues_id: 10, Number: 15, positions_id: 1 }]);
  assert.equal(r.person_ok && r.dup_ok && r.fields_ok, true);
  assert.deepEqual(r.person_after, { prizvushche: 'Новенко', Name: 'Петро', Date_of_birth: '2005-02-02', City: 'Київ', Growth: 180 });
  assert.equal(додати({ new: { ...нова, Date_of_birth: '' } }, [{ leagues_id: 10, Number: 15, positions_id: 1 }]).person_ok, false);
  assert.equal(додати({ new: { ...нова, prizvushche: ' свій ', Date_of_birth: '2000-01-01' } }, [{ leagues_id: 10, Number: 15, positions_id: 1 }]).dup_ok, false);
  assert.equal(додати({ new: { ...нова, Growth: 300 } }, [{ leagues_id: 10, Number: 15, positions_id: 1 }]).fields_ok, false);
  assert.equal(додати({ new: { ...нова, Photo: { path: 'https://x' } } }, [{ leagues_id: 10, Number: 15, positions_id: 1 }]).fields_ok, false);
  assert.equal(додати({}, [{ leagues_id: 10, Number: 15, positions_id: 1 }]).person_ok, false);
});

test('турніри: лише свої поточного сезону; закрите вікно; кожен один раз', () => {
  assert.equal(додати({ people_id: 4 }, []).rows_ok, false);
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 10, Number: 12, positions_id: 1 }, { leagues_id: 10, Number: 12, positions_id: 1 }]).rows_ok, false);
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 9, Number: 12, positions_id: 1 }]).league_ok, false); // минулий сезон
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 12, Number: 12, positions_id: 1 }]).window_ok, false); // вікно ще не відкрите
});

test('номер: 1–99, не зайнятий чинним гравцем чи відкритою заявкою; позиція — лише гравця', () => {
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 10, Number: 0, positions_id: 1 }]).number_ok, false);
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 10, Number: 7, positions_id: 1 }]).number_ok, false); // у Свого
  const зЗаявкою = (б) => ({ ...б, open: [{ leagues_id: 10, action: 'create', after: { Number: 21 } }] });
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 10, Number: 21, positions_id: 1 }], зЗаявкою).number_ok, false);
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 10, Number: 22, positions_id: 4 }]).position_ok, false); // посада штабу
});

test('уже в складі турніру чи вже є заявка — відмова', () => {
  assert.equal(додати({ people_id: 1 }, [{ leagues_id: 10, Number: 30, positions_id: 1 }]).already_ok, false);
  const зЗаявкою = (б) => ({ ...б, open: [{ leagues_id: 10, people_id: 4, action: 'create', after: { Number: 31 } }] });
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 10, Number: 32, positions_id: 1 }], зЗаявкою).already_ok, false);
});

test('варіант 3: номер і «вже заявлений» рахуються й за team_league', () => {
  const зДодатковим = (б) => ({ ...б, extra: [{ team_id: 100, people_id: 1, leagues_id: 12, Number: 70 }] });
  const відкрити = (б) => ({ ...зДодатковим(б), windows: [{ leagues_id: 12, starts_at: ЗАРАЗ - ДЕНЬ, ends_at: ЗАРАЗ + ДЕНЬ }] });
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 12, Number: 70, positions_id: 1 }], відкрити).number_ok, false);
  assert.equal(додати({ people_id: 1 }, [{ leagues_id: 12, Number: 71, positions_id: 1 }], відкрити).already_ok, false);
  // гравець клубу в основному турнірі 10 → додатковий 12: create, не перехід
  const r = додати({ people_id: 1 }, [{ leagues_id: 12, Number: 7, positions_id: 1 }], (б) => ({ ...б, windows: відкрити(б).windows }));
  assert.equal(Object.entries(r).filter(([k, v]) => k.endsWith('_ok') && !v).length, 0, JSON.stringify(r));
  assert.equal(r.rows[0].action, 'create');
});

test('склад: «також» — активні додаткові турніри гравця', () => {
  const склад = лямбда('club-clubs-id-squad.get.xs', 'squad');
  const з = { ...база(), extra: [{ id: 7, team_id: 100, leagues_id: 12, Number: 17, is_active: true }, { id: 8, team_id: 100, leagues_id: 9, Number: 3, is_active: false }] };
  з.cards = з.cards.filter((k) => k.teaminfo_id === 20);
  const r = склад(з, { teaminfo_id: 20 });
  assert.deepEqual(r.players[0].also, [{ id: 7, leagues_id: 12, league_name: 'Кубок', Number: 17 }]);
});

test('виведення: лише чинний, вікно, дата не раніше заявки; ключ team:<id>', () => {
  const вивести = лямбда('club-clubs-id-players-id-remove.post.xs', 'plan');
  const k = { id: 100, leagues_id: 10, Relevance_of_the_record: true, End_date: null, Date: '2026-09-01' };
  const з = (x = {}) => ({ card: k, extra: [], windows: [], rules: [], ...x });
  assert.deepEqual(вивести(з(), { end_date: '2026-10-30' }), { active: true, league_ok: true, leagues_id: 10, window_ok: true, date_ok: true, end_date: '2026-10-30', key: 'team:100' });
  assert.equal(вивести(з(), { end_date: '2026-08-01' }).date_ok, false);
  assert.equal(вивести(з(), { end_date: '2026-10-31' }).date_ok, false); // у майбутньому — 4.2 відхилить
  assert.equal(вивести(з({ card: { ...k, Relevance_of_the_record: false } }), { end_date: '2026-10-30' }).active, false);
  assert.equal(вивести(з({ rules: [{ leagues_id: 10, window_only: true }] }), { end_date: '2026-10-30' }).window_ok, false);
  assert.equal(вивести(з({ rules: [{ leagues_id: 12, window_only: true }] }), { end_date: '2026-10-30' }).window_ok, true); // правило чужого турніру
});

test('виведення з додаткового турніру (team_league): лише активний рядок цього гравця', () => {
  const вивести = лямбда('club-clubs-id-players-id-remove.post.xs', 'plan');
  const k = { id: 100, leagues_id: 10, Relevance_of_the_record: true, End_date: null, Date: '2026-09-01' };
  const з = (extra) => ({ card: k, extra, windows: [], rules: [] });
  const r = вивести(з([{ id: 7, leagues_id: 12, is_active: true }]), { leagues_id: 12, end_date: '2026-10-30' });
  assert.equal(r.league_ok && r.leagues_id === 12, true);
  assert.equal(вивести(з([{ id: 7, leagues_id: 12, is_active: false }]), { leagues_id: 12, end_date: '2026-10-30' }).league_ok, false);
  assert.equal(вивести(з([]), { leagues_id: 14, end_date: '2026-10-30' }).league_ok, false);
});

test('пошук особи: лише за прізвищем І повною датою; мінімум — ім’я, рік, активні клуби', () => {
  const знайти = лямбда('club-clubs-id-people-search.get.xs', 'found');
  const з = { people: база().people, cards: база().cards, teams: [{ id: 30, TeamName: 'Яструб' }, { id: 20, TeamName: 'Сокіл' }] };
  assert.deepEqual(знайти(з, { q: 'чужий', dob: '' }), { ok: false, people: [] });
  const r = знайти(з, { q: ' ЧУЖИЙ ', dob: '1999-05-05' });
  assert.deepEqual(r.people, [{ id: 2, prizvushche: 'Чужий', Name: 'Петро', birth_year: 1999, active_clubs: [{ teaminfo_id: 30, name: 'Яструб' }] }]);
  assert.deepEqual(знайти(з, { q: 'чужий', dob: '1999-05-06' }).people, []);
});


test('форма складу: лише обрані турніри; числа; капітан — так/ні', async () => {
  const { рядкиДляЗаявки, станРядка, виведенняЗ } = await import('./clubSquad.js');
  assert.deepEqual(
    виведенняЗ({ leagues_id: 10, league_name: 'Ліга', also: [{ leagues_id: 12, league_name: 'Кубок' }] }, [{ id: 10, window_open: true }, { id: 12, window_open: false }]),
    [
      { leagues_id: 10, name: 'Ліга', main: true, open: true },
      { leagues_id: 12, name: 'Кубок', main: false, open: false },
    ]
  );
  assert.deepEqual(
    рядкиДляЗаявки({ 10: { on: true, Number: '7', positions_id: '1', Captain: true }, 12: { on: false, Number: '7' }, 14: { on: true, Number: '', positions_id: '' } }),
    [
      { leagues_id: 10, Number: 7, positions_id: 1, Captain: true },
      { leagues_id: 14, Number: null, positions_id: null, Captain: false },
    ]
  );
  assert.deepEqual(рядкиДляЗаявки(null), []);
  // порядок — як обирали, не за id: перший стане основним
  assert.deepEqual(рядкиДляЗаявки({ 10: { on: true, Number: '7', positions_id: '1', order: 2 }, 12: { on: true, Number: '9', positions_id: '1', order: 1 } }).map((р) => р.leagues_id), [12, 10]);
  assert.equal(станРядка(null), null);
  assert.equal(станРядка({ action: 'remove', status: 'draft' }).текст, 'виведення — чернетка');
  assert.equal(станРядка({ action: 'update', status: 'submitted' }).тон, 'wait');
  assert.equal(станРядка({ action: 'remove', status: 'draft' }, 'Кубок').текст, 'виведення (Кубок) — чернетка');
});

// ——— 3.1б: змінити гравця ———
const змінити = (з, в) => лямбда('club-clubs-id-players-id.put.xs', 'plan')(
  {
    card: { id: 100, player_id: 1, teaminfo_id: 20, leagues_id: 10, Number: 7, positions_id: 1, Captain: false, Relevance_of_the_record: true },
    person: { id: 1, prizvushche: 'Свій', Name: 'Іван', po_batkovi: null, Date_of_birth: '2000-01-01', City: 'Київ', Growth: 180, Weight: null, Photo: { path: '/vault/a.png' } },
    extra: [{ id: 7, team_id: 100, people_id: 1, leagues_id: 12, Number: 17 }],
    cards: [{ id: 100, player_id: 1, leagues_id: 10, Number: 7 }, { id: 104, player_id: 5, leagues_id: 10, Number: 8 }],
    positions: база().positions,
    open_rows: [],
    ...з,
  },
  { teaminfo_id: 20, team_id: 100, ...в }
);
const помилки = (r) => Object.entries(r).filter(([k, v]) => k.endsWith('_ok') && !v).map(([k]) => k);

test('змінити гравця: лише змінені поля особи; порожнє — не чіпає', () => {
  const r = змінити({}, { person: { prizvushche: 'Свій', Name: 'Іван', po_batkovi: '', Date_of_birth: '2000-01-01', City: 'Львів', Growth: '180', Weight: '75', Photo: { path: '/vault/a.png' } } });
  assert.deepEqual(помилки(r), []);
  assert.deepEqual(r.person_after, { City: 'Львів', Weight: 75 });
  assert.equal(r.person_key, 'person:1');
  assert.equal(r.squad_empty, true);
  assert.equal(змінити({}, { person: { City: 'Київ' } }).person_empty, true);
  assert.deepEqual(змінити({}, { person: { Growth: '' } }).person_after, { Growth: null });
});

test('змінити гравця: перевірки полів особи', () => {
  assert.deepEqual(помилки(змінити({}, { person: { Name: ' ' } })), ['name_ok']);
  assert.deepEqual(помилки(змінити({}, { person: { Date_of_birth: '2030-01-01' } })), ['dob_ok']);
  assert.deepEqual(помилки(змінити({}, { person: { Growth: 300 } })), ['size_ok']);
  assert.deepEqual(помилки(змінити({}, { person: { Photo: { path: 'https://x' } } })), ['photo_ok']);
  assert.deepEqual(помилки(змінити({}, { person: { Phone: '1' } })), ['person_fields_ok']);
  assert.deepEqual(помилки(змінити({}, { person: { City: 'x'.repeat(101) } })), ['text_ok']);
});

test('змінити гравця: основний турнір — номер, позиція, капітан; додатковий — лише номер', () => {
  const r = змінити({}, { squad: { leagues_id: 10, Number: 11, positions_id: 2, Captain: true } });
  assert.deepEqual(r.squad_after, { Number: 11, positions_id: 2, Captain: true });
  assert.equal(r.squad_key, 'team:100');
  const д = змінити({}, { squad: { leagues_id: 12, Number: 18, positions_id: 2, Captain: true } });
  assert.deepEqual(д.squad_after, { Number: 18 });
  assert.equal(д.leagues_id, 12);
  assert.equal(змінити({}, { squad: { leagues_id: 12, Number: 17 } }).squad_empty, true);
  assert.deepEqual(помилки(змінити({}, { squad: { leagues_id: 14, Number: 5 } })), ['league_ok']);
});

test('змінити гравця: номер зайнятий іншим гравцем, team_league чи відкритою заявкою', () => {
  assert.deepEqual(помилки(змінити({}, { squad: { leagues_id: 10, Number: 8 } })), ['number_ok']);
  assert.deepEqual(помилки(змінити({ extra: [{ id: 9, team_id: 104, people_id: 5, leagues_id: 12, Number: 30 }, { id: 7, team_id: 100, people_id: 1, leagues_id: 12, Number: 17 }] }, { squad: { leagues_id: 12, Number: 30 } })), ['number_ok']);
  assert.deepEqual(помилки(змінити({ open_rows: [{ entity_id: null, leagues_id: 10, action: 'create', after: { Number: 40 } }] }, { squad: { leagues_id: 10, Number: 40 } })), ['number_ok']);
  assert.deepEqual(помилки(змінити({}, { squad: { leagues_id: 10, Number: 0 } })), ['number_ok']);
  assert.deepEqual(помилки(змінити({}, { squad: { leagues_id: 10, positions_id: 4 } })), ['position_ok']);
});

test('змінити гравця: «лише свої особи» — People читається після перевірки рядка Team свого клубу', () => {
  const s = fs.readFileSync(new URL('../../xano/crm/club-clubs-id-players-id.put.xs', import.meta.url), 'utf8');
  const сторож = s.indexOf('precondition ($card != null && $card.teaminfo_id == $input.teaminfo_id && $card.Relevance_of_the_record != false)');
  assert.ok(сторож > 0);
  assert.match(s.slice(сторож, сторож + 300), /error = "Це не ваш гравець"/);
  assert.ok(s.indexOf('db.get People') > сторож);
  assert.ok(s.indexOf('field_value = $card.player_id') > сторож);
  // чужу відкриту зміну складу (виведення чи інший турнір) порожня зміна не прибирає
  assert.match(s, /if \(\$plan\.squad_empty && \$own_squad\)/);
});

test('форма «Змінити гравця»: чинне + чернетка; додатковий турнір — лише номер', async () => {
  const { формаГравця } = await import('./clubSquad.js');
  const г = {
    team_id: 100, leagues_id: 10, Number: 7, positions_id: 1, Captain: true, prizvushche: 'Свій', Name: 'Іван', po_batkovi: null,
    Date_of_birth: '2000-01-01T00:00:00', City: 'Київ', Growth: 180, Weight: null, photo: { path: '/vault/a.png' },
    also: [{ leagues_id: 12, Number: 17 }],
    person_request: { id: 53, status: 'draft', after: { City: 'Львів' } },
    request: { id: 54, status: 'draft', action: 'update', leagues_id: 12, after: { Number: 18 } },
  };
  const ф = формаГравця(г);
  assert.deepEqual(ф.person, { prizvushche: 'Свій', Name: 'Іван', po_batkovi: '', Date_of_birth: '2000-01-01', City: 'Львів', Growth: '180', Weight: '', Photo: { path: '/vault/a.png' } });
  assert.deepEqual(ф.squad, { leagues_id: 10, Number: '7', positions_id: '1', Captain: true });
  assert.equal(ф.основний, true);
  assert.deepEqual(формаГравця(г, 12).squad, { leagues_id: 12, Number: '18' });
});

test('булеві з відкритої заявки — у лямбді (на null $x.поле у XanoScript не перевірено)', () => {
  for (const ф of ['club-clubs-id-draft.put.xs', 'club-clubs-id-players-id.put.xs']) {
    const s = fs.readFileSync(new URL(`../../xano/crm/${ф}`, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /\$open[a-z_]* == null \|\| \$open[a-z_]*\./, ф);
    assert.doesNotMatch(s, /\$open[a-z_]* != null && \$open[a-z_]*\./, ф);
  }
  const своя = лямбда('club-clubs-id-players-id.put.xs', 'own_squad');
  assert.equal(своя({ open_squad: null, plan: { leagues_id: 10 } }), false);
  assert.equal(своя({ open_squad: { status: 'draft', action: 'update', leagues_id: 10 }, plan: { leagues_id: 10 } }), true);
  assert.equal(своя({ open_squad: { status: 'draft', action: 'remove', leagues_id: 10 }, plan: { leagues_id: 10 } }), false);
  assert.equal(лямбда('club-clubs-id-players-id.put.xs', 'person_open_ok')({ open_person: null }), true);
  assert.equal(лямбда('club-clubs-id-draft.put.xs', 'open_ok')({ open: { status: 'submitted' } }), false);
});

test('капітан із форми нового гравця доходить до заявки (приймання PM 1, 05.11)', () => {
  const r = додати({ people_id: 4 }, [{ leagues_id: 10, Number: 12, positions_id: 1, Captain: true }]);
  assert.equal(r.rows[0].after.Captain, true);
  assert.equal(додати({ people_id: 4 }, [{ leagues_id: 10, Number: 12, positions_id: 1 }]).rows[0].after.Captain, false);
});
