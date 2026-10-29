import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { колиЗнову, підсумокЧернеток } from './clubBatch.js';

// Виконати лямбду з .xs, що стоїть перед «} as $<ім'я>»
const лямбда = (файл, ім) => {
  const xs = fs.readFileSync(new URL(`../../xano/crm/${файл}`, import.meta.url), 'utf8');
  const кінець = xs.indexOf(`} as $${ім}`);
  const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
  const f = new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'));
  return (змінні, вхід = {}, зараз = 1_800_000_000_000) => {
    const справжній = Date.now;
    Date.now = () => зараз;
    try {
      return f(змінні, вхід);
    } finally {
      Date.now = справжній;
    }
  };
};
const ЗАРАЗ = 1_800_000_000_000;
const ГОД = 3600_000;

test('submit: before — лише змінювані поля основного запису на момент подачі; create — null', () => {
  const план = лямбда('club-clubs-id-submit.post.xs', 'plan');
  const r = план({
    drafts: [
      { id: 1, entity: 'club', action: 'update', entity_id: 58, after: { TeamInfo: 'Нове', website: 'https://a.b' } },
      { id: 2, entity: 'person', action: 'update', entity_id: 7, after: { Name: 'Іван' } },
      { id: 3, entity: 'squad_row', action: 'create', entity_id: null, after: { Number: 9 } },
      { id: 4, entity: 'squad_row', action: 'remove', entity_id: 30, after: { End_date: '2026-11-01' } },
    ],
    recent: [],
    club: { id: 58, TeamName: 'Київ Футзал', TeamInfo: 'Старе', website: null, TeamLogo: { path: '/vault/x' } },
    people: [{ id: 7, Name: 'Іван', prizvushche: 'Тест' }],
    squad: [{ id: 30, End_date: null, Number: 4 }],
    staff: [],
  });
  assert.equal(r.has_drafts, true);
  assert.equal(r.rate_ok, true);
  assert.deepEqual(r.rows, [
    { id: 1, before: { TeamInfo: 'Старе', website: null } },
    { id: 2, before: { Name: 'Іван' } },
    { id: 3, before: null },
    { id: 4, before: { End_date: null } },
  ]);
});

test('submit: без чернеток — нічого; ліміт 1 пакет/год', () => {
  const план = лямбда('club-clubs-id-submit.post.xs', 'plan');
  assert.equal(план({ drafts: [], recent: [] }).has_drafts, false);
  assert.equal(план({ drafts: [], recent: [{ submitted_at: ЗАРАЗ - 30 * 60_000 }] }, {}, ЗАРАЗ).rate_ok, false);
  assert.equal(план({ drafts: [], recent: [{ submitted_at: ЗАРАЗ - ГОД }] }, {}, ЗАРАЗ).rate_ok, true);
  // запит недавніх пакетів сам відкидає відкликані
  assert.match(fs.readFileSync(new URL('../../xano/crm/club-clubs-id-submit.post.xs', import.meta.url), 'utf8'), /\$db\.change_batch\.status != "withdrawn"/);
});

test('submit: межі тексту — назва до 200, коментар до 1000', () => {
  const план = лямбда('club-clubs-id-submit.post.xs', 'plan');
  assert.equal(план({ drafts: [], recent: [] }, { title: 'а'.repeat(200), club_comment: 'б'.repeat(1000) }).text_ok, true);
  assert.equal(план({ drafts: [], recent: [] }, { title: 'а'.repeat(201) }).text_ok, false);
  assert.equal(план({ drafts: [], recent: [] }, { club_comment: 'б'.repeat(1001) }).text_ok, false);
});

test('withdraw: лише поки жоден рядок не має рішення', () => {
  const план = лямбда('club-clubs-id-batches-id-withdraw.post.xs', 'plan');
  assert.deepEqual(план({ rows: [{ id: 1, status: 'submitted' }, { id: 2, status: 'submitted' }] }), { undecided: true, ids: [1, 2] });
  assert.equal(план({ rows: [{ id: 1, status: 'submitted' }, { id: 2, status: 'approved' }] }).undecided, false);
});

test('pending: відкритий пакет із кількістю рішень; коли знову можна надіслати (відкликані не рахуються)', () => {
  const стан = лямбда('club-clubs-id-pending.get.xs', 'state');
  const r = стан(
    {
      batches: [
        { id: 9, status: 'withdrawn', submitted_at: ЗАРАЗ - 10 * 60_000 },
        { id: 8, status: 'submitted', submitted_at: ЗАРАЗ - 20 * 60_000 },
      ],
      batch_rows: [
        { batch_id: 8, status: 'submitted' },
        { batch_id: 8, status: 'approved' },
        { batch_id: 7, status: 'applied' },
      ],
    },
    {},
    ЗАРАЗ
  );
  assert.equal(r.open_batch.id, 8);
  assert.equal(r.open_batch.rows, 2);
  assert.equal(r.open_batch.decided, 1);
  assert.equal(r.next_submit_at, ЗАРАЗ - 20 * 60_000 + ГОД);
  assert.equal(стан({ batches: [], batch_rows: [] }).next_submit_at, null);
});

test('підсумок чернеток: картка, гравці, штаб — українською з відмінками', () => {
  assert.equal(підсумокЧернеток([]), '');
  assert.equal(
    підсумокЧернеток([
      { entity: 'club', action: 'update', after: { a: 1, b: 2, c: 3, d: 4 } },
      { entity: 'squad_row', action: 'create' },
      { entity: 'squad_row', action: 'create' },
      { entity: 'squad_row', action: 'transfer' },
      { entity: 'squad_row', action: 'update' },
      { entity: 'squad_row', action: 'update' },
      { entity: 'squad_row', action: 'remove' },
      { entity: 'staff_row', action: 'create' },
      { entity: 'person', action: 'create' },
    ]),
    'Картка: 4 зміни · Гравців: +3, змінено 2, виведено 1 · Штаб: +1'
  );
  assert.equal(підсумокЧернеток([{ entity: 'club', after: { a: 1 } }]), 'Картка: 1 зміна');
  assert.equal(підсумокЧернеток([{ entity: 'club', after: Object.fromEntries([...Array(11)].map((_, i) => [i, 1])) }]), 'Картка: 11 змін');
});

test('коли знову — час за Києвом; минуле — null', () => {
  assert.equal(колиЗнову(null), null);
  assert.equal(колиЗнову(ЗАРАЗ - 1, ЗАРАЗ), null);
  assert.match(колиЗнову(Date.UTC(2026, 10, 1, 12, 5), Date.UTC(2026, 10, 1, 11, 30)), /^14:05$/); // UTC+2 узимку
});
