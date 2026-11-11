import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { назваДії, підказкаНевдачі, порівняння } from './moderation.js';

// «Погодження» (самообслуговування клубів, 4.1): лямбди з самих .xs і показ «було / стане»
const читати = (ф) => fs.readFileSync(new URL(`../../xano/crm/${ф}`, import.meta.url), 'utf8');
const лямбда = (файл, ім) => {
  const xs = читати(файл);
  const кінець = xs.indexOf(`} as $${ім}`);
  const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
  const f = new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'));
  return (з, в = {}) => {
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

test('лічильник меню: пакети з рядком submitted', () => {
  const r = лямбда('moderation-count.get.xs', 'count')({ open: [{ batch_id: 1 }, { batch_id: 1 }, { batch_id: 2 }] });
  assert.deepEqual(r, { batches: 2, rows: 3 });
});

test('список пакетів: стан за рядками; фільтри клуб і тип; ті, що чекають, — від найстаріших', () => {
  const список = лямбда('moderation-batches.get.xs', 'result');
  const з = {
    batches: [
      { id: 1, teaminfo_id: 20, status: 'submitted', submitted_at: 100 },
      { id: 2, teaminfo_id: 30, status: 'submitted', submitted_at: 50, acted_by_users_id: 7 },
      { id: 3, teaminfo_id: 20, status: 'closed', submitted_at: 10 },
      { id: 4, teaminfo_id: 20, status: 'withdrawn', submitted_at: 5 },
    ],
    rows: [
      { id: 10, batch_id: 1, entity: 'club', status: 'submitted' },
      { id: 11, batch_id: 2, entity: 'squad_row', status: 'submitted' },
      { id: 12, batch_id: 2, entity: 'person', status: 'applied' },
      { id: 13, batch_id: 3, entity: 'squad_row', status: 'rejected' },
    ],
    teams: [{ id: 20, TeamName: 'Сокіл' }, { id: 30, TeamName: 'Яструб' }],
    users: [{ id: 7, Name: 'Адмін Тест' }],
  };
  const відкриті = список(з, { state: 'open' });
  assert.deepEqual(відкриті.map((b) => b.id), [2, 1]);
  assert.equal(відкриті[0].acted_by_name, 'Адмін Тест');
  assert.deepEqual(відкриті[0].counts, { submitted: 1, approved: 0, applied: 1, rejected: 0, failed: 0 });
  assert.deepEqual(список(з, { state: 'done' }).map((b) => b.id), [3]);
  assert.deepEqual(список(з, { state: 'withdrawn' }).map((b) => b.id), [4]);
  assert.deepEqual(список(з, { state: 'all', teaminfo_id: 20 }).map((b) => b.id), [1, 3, 4]);
  assert.deepEqual(список(з, { state: 'all', entity: 'squad_row' }).map((b) => b.id), [2, 3]);
});

const деталі = (rows, з = {}) =>
  лямбда('moderation-batches-id.get.xs', 'result')({
    batch: { id: 5, teaminfo_id: 20, status: 'submitted', submitted_at: 1 },
    rows,
    cards: [{ id: 100, player_id: 1, leagues_id: 10, Number: 7, Relevance_of_the_record: true }],
    extra: [
      { id: 7, team_id: 100, leagues_id: 12, Number: 17, Date: '2026-09-10', is_active: true },
      { id: 8, team_id: 100, leagues_id: 14, Number: 27, Date: '2026-09-01', is_active: true },
    ],
    people: [{ id: 1, prizvushche: 'Свій', Name: 'Іван' }, { id: 2, prizvushche: 'Чужий', Name: 'Петро' }],
    teams: [{ id: 20, TeamName: 'Сокіл' }, { id: 30, TeamName: 'Яструб' }],
    leagues: [{ id: 10, League: 'Ліга' }, { id: 12, League: 'Кубок' }, { id: 14, League: 'Перша' }],
    positions: [{ id: 1, Position: 'Універсал' }, { id: 5, Position: 'Лікар' }],
    venues: [{ id: 3, City: 'м. Тест, СК' }],
    windows: [],
    rules: [{ leagues_id: 14, window_only: true }],
    users: [],
    ...з,
  });

test('пакет: назви, перехід, нова особа; person.create окремо не вирішується', () => {
  const r = деталі([
    { id: 50, entity: 'person', action: 'create', after: { prizvushche: 'Новенко', Name: 'Іра' }, status: 'submitted' },
    { id: 51, entity: 'squad_row', action: 'create', depends_on_id: 50, leagues_id: 10, after: { Number: 9, positions_id: 1 }, status: 'submitted' },
    { id: 52, entity: 'squad_row', action: 'create', depends_on_id: 50, leagues_id: 12, after: { Number: 9, positions_id: 1 }, status: 'submitted' },
    { id: 53, entity: 'squad_row', action: 'transfer', people_id: 2, transfer_from_teaminfo_id: 30, leagues_id: 14, after: { Number: 4, positions_id: 1 }, status: 'submitted' },
    { id: 54, entity: 'club', action: 'update', entity_id: 20, before: { home_venues_id: null }, after: { home_venues_id: 3 }, status: 'submitted' },
  ]);
  const за = Object.fromEntries(r.rows.map((x) => [x.id, x]));
  assert.equal(за[50].decidable, false);
  assert.equal(за[50].person_name, 'Новенко Іра');
  assert.equal(за[51].person_name, 'Новенко Іра');
  assert.equal(за[51].new_person, true);
  // варіант 3: перший рядок нової особи — Team, решта — team_league
  assert.equal(за[51].target, 'Team');
  assert.equal(за[52].target, 'team_league');
  assert.equal(за[53].transfer_from_name, 'Яструб');
  assert.equal(за[53].window_open, false); // Перша — лише в період, періоду немає
  assert.equal(за[51].window_open, true);
  assert.deepEqual(r.labels, { positions: { 1: 'Універсал' }, venues: { 3: 'м. Тест, СК' } });
  assert.equal(r.batch.club_name, 'Сокіл');
});

test('пакет: виведення з основного турніру, коли є додаткові — «основний зміниться» на найраніший', () => {
  const r = деталі([
    { id: 60, entity: 'squad_row', action: 'remove', entity_id: 100, people_id: 1, leagues_id: 10, after: { End_date: '2026-10-30' }, status: 'submitted' },
    { id: 61, entity: 'squad_row', action: 'create', people_id: 1, leagues_id: 14, after: { Number: 5, positions_id: 1 }, status: 'submitted' },
  ]);
  assert.deepEqual(r.rows[0].primary_change, { leagues_id: 14, league_name: 'Перша', Number: 27 });
  assert.equal(r.rows[1].target, 'team_league'); // гравець уже в складі клубу
  const з = деталі([{ id: 62, entity: 'squad_row', action: 'remove', entity_id: 100, people_id: 1, leagues_id: 12, after: { End_date: '2026-10-30' }, status: 'submitted' }]);
  assert.equal(з.rows[0].primary_change, null);
  assert.equal(з.rows[0].target, 'team_league');
});

test('«Повернути»: коментар 3–1000; person.create — ні (переходи — clubCas.test.js)', () => {
  const перевірка = лямбда('moderation-requests-id-reject.post.xs', 'check');
  assert.deepEqual(перевірка({ row: { batch_id: 5, entity: 'club', action: 'update' } }, { comment: 'Фото розмите' }), { found: true, decidable: true, comment_ok: true });
  assert.equal(перевірка({ row: { batch_id: 5, entity: 'club' } }, { comment: 'ок' }).comment_ok, false);
  assert.equal(перевірка({ row: { batch_id: 5, entity: 'person', action: 'create' } }, { comment: 'Дубль особи' }).decidable, false);
  assert.equal(перевірка({ row: null }, { comment: 'Дубль особи' }).found, false);
  assert.equal(перевірка({ row: { batch_id: null, entity: 'club' } }, { comment: 'Чернетка' }).found, false);

});

test('«Погодження» — лише право 21, до будь-якого читання', () => {
  for (const ф of ['moderation-count.get.xs', 'moderation-batches.get.xs', 'moderation-batches-id.get.xs', 'moderation-requests-id-reject.post.xs']) {
    const s = читати(ф);
    assert.match(s, /^\s*auth = "Users"$/m, ф);
    assert.match(s, /input = \{id_access_rights: 21, user_id: \$auth\.id\}/, ф);
    assert.ok(s.indexOf('id_access_rights: 21') < s.indexOf('db.'), ф);
  }
});

test('«було / стане»: поля з білого списку в його порядку; назви посилань; create — без «було»', () => {
  const labels = { positions: { 1: 'Універсал' }, venues: { 3: 'м. Тест, СК' } };
  assert.deepEqual(порівняння({ entity: 'club', before: { home_venues_id: null, TeamInfo: 'Старе' }, after: { TeamInfo: 'Нове', home_venues_id: 3, Relevance: false } }, labels), [
    { key: 'TeamInfo', label: 'Місто', kind: 'text', before: 'Старе', after: 'Нове' },
    { key: 'home_venues_id', label: 'Домашня арена', kind: 'venue', before: null, after: 'м. Тест, СК' },
  ]);
  assert.deepEqual(порівняння({ entity: 'squad_row', before: null, after: { Number: 9, positions_id: 1, Captain: true } }, labels).map((x) => [x.label, x.before, x.after]), [
    ['Номер', null, '9'],
    ['Позиція', null, 'Універсал'],
    ['Капітан', null, 'так'],
  ]);
  assert.equal(порівняння({ entity: 'person', after: { Photo: { url: 'u' } } })[0].after.url, 'u');
  assert.equal(назваДії({ entity: 'squad_row', action: 'transfer' }), 'Перехід до складу');
});

test('підказка АФУ для переходу, що не застосувався за правилом', () => {
  const r = { apply_error: 'У гравця є чинна заявка в іншому клубі з датою не раніше за сьогоднішню — АФУ має спершу її закрити', transfer_from_name: 'Яструб' };
  // новий текст правил 4.2 (11.11) — та сама підказка
  assert.match(підказкаНевдачі({ apply_error: 'Гравець заявлений за Яструб (Екстра-ліга 2026/27) з 30.10.2026 — не раніше за сьогодні. АФУ має спершу закрити ту заявку', transfer_from_name: 'Яструб' }), /у «Яструб» закрийте заявку/);
  assert.match(підказкаНевдачі(r), /у «Яструб» закрийте заявку гравця \(Клуби → Яструб → Склад → «Закрити»\), потім клуб подає гравця ще раз/);
  assert.match(підказкаНевдачі({ apply_error: 'Перехід, але чинної заявки в іншому клубі вже немає — подайте як додавання' }), /звичайне додавання/);
  assert.equal(підказкаНевдачі({ apply_error: 'Номер 16 уже має інший гравець цього клубу в турнірі' }), null);
  assert.equal(підказкаНевдачі({}), null);
});
