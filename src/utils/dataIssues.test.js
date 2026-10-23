import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { групи, підсумок, РІВНІ } from './dataIssues.js';

// Виконуємо САМЕ ту лямбду, що піде в Xano (xano/crm/data-issues.get.xs):
// $var.X → v.X, решта — звичайний JS.
const xs = fs.readFileSync(new URL('../../xano/crm/data-issues.get.xs', import.meta.url), 'utf8');
const код = xs.match(/api\.lambda \{\s*code = """([\s\S]*?)"""/)[1];
const лямбда = new Function('v', код.replace(/\$var\./g, 'v.'));
const ГОД = 3600000;
const ДЕНЬ = 24 * ГОД;
// 23.10.2026 12:00 за Києвом (UTC+3)
const ЗАРАЗ = Date.UTC(2026, 9, 23, 9, 0);
const виконати = (v) => {
  const справжній = Date.now;
  Date.now = () => ЗАРАЗ;
  try {
    return лямбда(v);
  } finally {
    Date.now = справжній;
  }
};
// 18:00 і 00:00 за Києвом у день «зараз + днів». Лише до 25.10: тоді Україна
// переходить на зимовий час (UTC+3 → UTC+2), і ці зсуви вже не київські —
// для дат «далеко» години не важливі.
const о18 = (днів) => Date.UTC(2026, 9, 23, 15, 0) + днів * ДЕНЬ;
const опівночі = (днів) => Date.UTC(2026, 9, 22, 21, 0) + днів * ДЕНЬ;

const ФОТО = { path: '/vault/x.jpg' };
const база = () => ({
  seasons: [{ id: 2, name: '2025/26' }, { id: 3, name: '2026/27', is_current: true }],
  leagues: [
    { id: 10, League: 'Екстра-ліга', season_id: 3, Relevance: true, league_id: 1 },
    { id: 12, League: 'Кубок', season_id: 3, Relevance: true, league_id: 2 },
    { id: 13, League: 'Збірна', season_id: 3, Relevance: true, league_id: 3 },
    { id: 9, League: 'Минулий сезон', season_id: 2, Relevance: true, league_id: 1 },
  ],
  competitions: [{ id: 1, show_in_app: true }, { id: 2, show_in_app: true }, { id: 3, show_in_app: false }],
  matches: [],
  events: [],
  squads: [],
  cards: [],
  people: [],
  clubs: [
    { id: 1, TeamName: 'Схід', TeamLogo: ФОТО, TeamInfo: 'Київ', home_venues_id: 1 },
    { id: 2, TeamName: 'Захід', TeamLogo: ФОТО, TeamInfo: 'Львів', home_venues_id: 2 },
  ],
  venues: [
    { id: 1, City: 'м. Київ, А', map_url: 'https://maps.app.goo.gl/x', lat: 50.4, lng: 30.5 },
    { id: 2, City: 'м. Львів, Б', map_url: '', lat: null, lng: null },
  ],
  staff: [],
  positions: [{ id: 1, Player_position: true }, { id: 7, Player_position: false }],
  tours: [{ id: 100, leagues_id: 10, league_stage_id: 1 }],
  stages: [{ id: 1, stage_type: 'таблиця' }],
  table: [],
  zones: [{ leagues_id: 10, league_stage_id: 1 }],
  participants: [{ leagues_id: 10, teaminfo_id: 1 }, { leagues_id: 10, teaminfo_id: 2 }],
  users: [{ id: 5, Name: 'Делегат', types_of_user_roles_id: 2, Relevance: true }],
});
const матч = (id, o) => ({ id, leagues_id: 10, team1_id: 1, team2_id: 2, tours_id: 100, venues_id: 1, match_status_id: 1, referee1_id: 3, users_idDelegat: 5, TimeOfMatch: о18(3), ...o });
const перевірка = (r, code) => r.checks.find((c) => c.code === code);
const ids = (r, code) => перевірка(r, code).items.map((i) => i.id);

test('без поточного сезону — порожньо', () => {
  const r = виконати({ ...база(), seasons: [{ id: 3, name: 'x' }] });
  assert.deepEqual(r.checks, []);
  assert.equal(r.season, null);
});

test('матчі: протокол, минулі, онлайн задовго, делегат 14 днів, судді, час', () => {
  const v = база();
  v.matches = [
    матч(1, { match_status_id: 4, TimeOfMatch: о18(-7) }), // зіграний без протоколу
    матч(2, { match_status_id: 4, TimeOfMatch: о18(-7) }), // зіграний, є подія
    матч(3, { match_status_id: 4, TimeOfMatch: о18(-7), users_idDelegat: null }), // є лише заявка; без делегата
    матч(4, { match_status_id: 1, TimeOfMatch: ЗАРАЗ - 4 * ГОД }), // запланований у минулому > 3 год
    матч(5, { match_status_id: 1, TimeOfMatch: ЗАРАЗ - 2 * ГОД }), // ще в межах 3 год — ні
    матч(6, { match_status_id: 2, TimeOfMatch: ЗАРАЗ - ДЕНЬ }), // перенесений без нової дати
    матч(7, { match_status_id: 3, TimeOfMatch: ЗАРАЗ - 4 * ГОД }), // онлайн задовго
    матч(8, { match_status_id: 5, TimeOfMatch: ЗАРАЗ - 2 * ГОД }), // пауза, ще ні
    матч(9, { users_idDelegat: null, TimeOfMatch: о18(1) }), // ≤ 14 днів без делегата
    матч(10, { users_idDelegat: 0, TimeOfMatch: о18(30), referee1_id: null }), // > 14 днів, 0 = немає; без суддів
    матч(11, { TimeOfMatch: опівночі(1) }), // 00:00 — без часу
    матч(12, { leagues_id: 9, match_status_id: 4, TimeOfMatch: о18(-400) }), // минулий сезон — не рахується
  ];
  v.events = [{ match_id: 2 }];
  v.squads = [{ match_id: 3 }];
  const r = виконати(v);
  assert.equal(r.season.name, '2026/27');
  assert.deepEqual(ids(r, 'played_no_protocol'), [1]);
  assert.equal(перевірка(r, 'played_no_protocol').total, 3);
  assert.deepEqual(ids(r, 'past_not_played'), [4, 6]);
  assert.deepEqual(ids(r, 'live_too_long'), [7]);
  assert.deepEqual(ids(r, 'future_no_delegate_soon'), [9]);
  assert.deepEqual(ids(r, 'future_no_delegate_later'), [10]);
  assert.deepEqual(ids(r, 'future_no_referee'), [10]);
  assert.deepEqual(ids(r, 'future_no_time'), [11]);
  assert.deepEqual(ids(r, 'played_no_officials'), [3]);
  // посилання: протокол — сторінка матчу; делегат — картка розкладу
  assert.equal(перевірка(r, 'played_no_protocol').items[0].link, '/matches/1');
  assert.equal(перевірка(r, 'future_no_delegate_soon').items[0].link, '/tournaments/10?tab=matches&edit=9');
  assert.match(перевірка(r, 'future_no_time').items[0].label, /^24\.10\.2026 · Схід — Захід$/); // без вигаданого 00:00
  assert.match(перевірка(r, 'future_no_delegate_soon').items[0].label, /^24\.10\.2026, 18:00 · Схід — Захід$/);
});

test('склади: без номера (0 = немає), дублі, неактуальні картки не рахуються', () => {
  const v = база();
  v.people = [1, 2, 3, 4].map((id) => ({ id, prizvushche: 'Гравець' + id, Name: 'Т', Photo: ФОТО, Date_of_birth: '2000-01-01' }));
  v.cards = [
    { id: 11, player_id: 1, teaminfo_id: 1, Number: 0, leagues_id: 10, positions_id: 1 },
    { id: 12, player_id: 2, teaminfo_id: 1, Number: 7, leagues_id: 10, positions_id: 1 },
    { id: 13, player_id: 3, teaminfo_id: 1, Number: 7, leagues_id: 10, positions_id: 1 },
    { id: 14, player_id: 4, teaminfo_id: 1, Number: null, leagues_id: 10, positions_id: 1, End_date: '2026-01-01' }, // закрита
    { id: 15, player_id: 4, teaminfo_id: 2, Number: null, leagues_id: 10, positions_id: null, Relevance_of_the_record: true },
  ];
  const r = виконати(v);
  assert.deepEqual(ids(r, 'card_no_number'), [15, 11]); // за клубом: «Захід» раніше за «Схід»
  assert.equal(перевірка(r, 'card_no_number').total, 4);
  assert.equal(перевірка(r, 'card_no_number').items[1].link, '/clubs/1?tab=roster');
  const д = перевірка(r, 'number_duplicate');
  assert.equal(д.count, 1);
  assert.equal(д.items[0].label, 'Схід: №7');
  assert.equal(д.items[0].sub, 'Гравець2 Т, Гравець3 Т');
  assert.deepEqual(ids(r, 'players_incomplete'), [4]); // без позиції в картці 15
  assert.match(перевірка(r, 'players_incomplete').items[0].link, /^\/people\?q=/);
});

test('арени, турніри, клуби, штаб, делегати', () => {
  const v = база();
  v.matches = [матч(1, { venues_id: 2 }), матч(2, { leagues_id: 12, match_status_id: 4, TimeOfMatch: о18(-3) })];
  v.events = [{ match_id: 2 }];
  v.venues.push({ id: 3, City: 'м. Дніпро, В', map_url: null });
  v.table = [{ leagues_id: 10, teaminfo_id: 1 }, { leagues_id: 10, teaminfo_id: 3 }];
  v.zones = [];
  v.clubs[1] = { ...v.clubs[1], TeamLogo: null, home_venues_id: null };
  v.people = [{ id: 50, prizvushche: 'Тренер', Name: 'А', Photo: null }];
  v.staff = [{ id: 70, people_id: 50, teaminfo_id: 1, positions_id: 1, leagues_id: 10 }];
  v.users = [{ id: 5, Name: 'Старий', types_of_user_roles_id: 2, Relevance: false }];
  const r = виконати(v);
  assert.deepEqual(ids(r, 'venue_future_no_map'), [2]);
  assert.equal(перевірка(r, 'venue_future_no_map').items[0].link, '/venues?edit=2');
  assert.deepEqual(ids(r, 'venue_no_map'), [3]);
  // Кубок: 0 учасників → порожній; Збірна прихована в застосунку — ні
  assert.deepEqual(ids(r, 'empty_tournament_shown'), [12]);
  assert.deepEqual(ids(r, 'table_stage_no_zones'), [10]);
  assert.equal(перевірка(r, 'table_stage_no_zones').items[0].link, '/tournaments/10?tab=zones');
  const т = перевірка(r, 'participants_vs_table').items[0];
  assert.equal(т.id, 10);
  assert.match(т.sub, /немає в таблиці: Захід; зайві в таблиці: клуб 3/);
  assert.deepEqual(ids(r, 'club_no_home_venue'), [2]);
  assert.deepEqual(ids(r, 'club_no_logo_or_city'), [2]);
  assert.deepEqual(ids(r, 'staff_incomplete'), [70]);
  assert.match(перевірка(r, 'staff_incomplete').items[0].sub, /без фото, роль гравця замість посади/);
  assert.deepEqual(ids(r, 'inactive_delegate_assigned'), [5]);
});

test('таблиці ще немає — не помилка', () => {
  const r = виконати(база());
  assert.equal(перевірка(r, 'participants_vs_table').count, 0);
});

test('понад 1000 — обрізано з позначкою', () => {
  const v = база();
  v.matches = Array.from({ length: 1003 }, (_, i) => матч(i + 1, { match_status_id: 4, TimeOfMatch: о18(-5) }));
  const c = перевірка(виконати(v), 'played_no_protocol');
  assert.equal(c.count, 1003);
  assert.equal(c.items.length, 1000);
  assert.equal(c.truncated, true);
});

test('рівні й порядок перевірок — як у брифі', () => {
  const r = виконати(база());
  assert.deepEqual(r.checks.map((c) => c.level), [
    ...Array(4).fill('critical'),
    ...Array(9).fill('important'),
    ...Array(7).fill('advice'),
  ]);
  assert.deepEqual(Object.keys(РІВНІ), ['critical', 'important', 'advice']);
  const г = групи(r.checks);
  assert.deepEqual(г.map((x) => x.level), ['critical', 'important', 'advice']);
  assert.equal(підсумок([]), 'Проблем не знайдено');
});

test('00:00 після переходу на зимовий час — теж «без часу»', () => {
  const v = база();
  // 01.11.2026 00:00 за Києвом = 31.10 22:00 UTC (UTC+2)
  v.matches = [матч(1, { TimeOfMatch: Date.UTC(2026, 9, 31, 22, 0) }), матч(2, { TimeOfMatch: Date.UTC(2026, 9, 31, 21, 0) })];
  assert.deepEqual(ids(виконати(v), 'future_no_time'), [1]);
});

test('порядок: майбутні — найближчі зверху, зіграні — свіжі зверху, гравці — клуб і прізвище, арени — за назвою', () => {
  const v = база();
  v.clubs.push({ id: 3, TeamName: 'Альфа', TeamLogo: ФОТО, TeamInfo: 'Дніпро', home_venues_id: 1 });
  v.matches = [
    матч(1, { users_idDelegat: null, TimeOfMatch: о18(2) }),
    матч(2, { users_idDelegat: null, TimeOfMatch: о18(1) }),
    матч(3, { users_idDelegat: null, TimeOfMatch: о18(1) + ГОД }),
    матч(4, { match_status_id: 4, TimeOfMatch: о18(-9) }),
    матч(5, { match_status_id: 4, TimeOfMatch: о18(-2) }),
    матч(6, { match_status_id: 4, TimeOfMatch: о18(-5) }),
  ];
  v.people = [
    { id: 1, prizvushche: 'Яковенко', Name: 'А' },
    { id: 2, prizvushche: 'Іваненко', Name: 'Б' },
    { id: 3, prizvushche: 'Бондар', Name: 'В' },
  ];
  v.cards = [
    { id: 11, player_id: 1, teaminfo_id: 1, Number: 0, leagues_id: 10, positions_id: 1 }, // Схід, Яковенко
    { id: 12, player_id: 2, teaminfo_id: 1, Number: 0, leagues_id: 10, positions_id: 1 }, // Схід, Іваненко
    { id: 13, player_id: 3, teaminfo_id: 3, Number: 0, leagues_id: 10, positions_id: 1 }, // Альфа, Бондар
  ];
  v.venues = [
    { id: 7, City: 'м. Ужгород, Я', map_url: '' },
    { id: 8, City: 'м. Івано-Франківськ, Б', map_url: '' },
    { id: 9, City: 'м. Біла Церква, В', map_url: '' },
  ];
  const r = виконати(v);
  assert.deepEqual(ids(r, 'future_no_delegate_soon'), [2, 3, 1]);
  assert.deepEqual(ids(r, 'played_no_protocol'), [5, 6, 4]);
  assert.deepEqual(ids(r, 'card_no_number'), [13, 12, 11]); // Альфа; Схід: Іваненко, Яковенко
  assert.deepEqual(ids(r, 'venue_no_map'), [9, 8, 7]); // Б, І, У — українська абетка (І після И)
});
