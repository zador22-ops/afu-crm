import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// «Службове → Заявкові періоди» (самообслуговування клубів, 3.4): лямбди з самих .xs
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

test('періоди: турніри поточного сезону з вікнами, «відкрито зараз» і «наступне»', () => {
  const список = лямбда('registration-windows.get.xs', 'result');
  const з = {
    seasons: [{ id: 3, is_current: true }],
    leagues: [
      { id: 10, League: 'Екстра-ліга', season_id: 3 },
      { id: 12, League: 'Кубок', season_id: 3 },
      { id: 14, League: 'Перша ліга', season_id: 3 },
      { id: 9, League: 'Минулий', season_id: 2 },
    ],
    windows: [
      { id: 1, leagues_id: 12, starts_at: ЗАРАЗ - ДЕНЬ, ends_at: ЗАРАЗ + ДЕНЬ, note: 'осінь' },
      { id: 2, leagues_id: 14, starts_at: ЗАРАЗ + 5 * ДЕНЬ, ends_at: ЗАРАЗ + 9 * ДЕНЬ },
      { id: 3, leagues_id: 14, starts_at: ЗАРАЗ + 30 * ДЕНЬ, ends_at: ЗАРАЗ + 40 * ДЕНЬ },
    ],
    rules: [{ leagues_id: 12, window_only: true }, { leagues_id: 14, window_only: true }],
  };
  const r = список(з, {});
  assert.deepEqual(r.map((l) => [l.id, l.window_only, l.open_now, l.next_window_at]), [
    [10, false, true, null], // без прапорця — склад змінюється будь-коли
    [12, true, true, null],
    [14, true, false, ЗАРАЗ + 5 * ДЕНЬ],
  ]);
  assert.deepEqual(r[1].windows, [{ id: 1, starts_at: ЗАРАЗ - ДЕНЬ, ends_at: ЗАРАЗ + ДЕНЬ, note: 'осінь' }]);
  assert.equal(список(з, { all: true }).length, 4);
});

test('період: кінець пізніше початку; без перетину з іншими періодами турніру (свій не рахується)', () => {
  const додати = лямбда('registration-windows.post.xs', 'check');
  const інші = [{ id: 1, leagues_id: 12, starts_at: 100, ends_at: 200 }, { id: 2, leagues_id: 12, starts_at: 300, ends_at: 400 }];
  assert.deepEqual(додати({ others: інші }, { leagues_id: 12, starts_at: 200, ends_at: 300 }), { order_ok: true, overlap_ok: true, note_ok: true });
  assert.equal(додати({ others: інші }, { leagues_id: 12, starts_at: 150, ends_at: 250 }).overlap_ok, false);
  assert.equal(додати({ others: інші }, { leagues_id: 12, starts_at: 250, ends_at: 250 }).order_ok, false);
  assert.equal(додати({ others: інші }, { leagues_id: 12, starts_at: 1, ends_at: 2, note: 'x'.repeat(201) }).note_ok, false);
  const змінити = лямбда('registration-windows-id.patch.xs', 'check');
  assert.equal(змінити({ others: інші, was: { leagues_id: 12 } }, { registration_window_id: 1, starts_at: 50, ends_at: 250 }).overlap_ok, true);
  assert.equal(змінити({ others: інші, was: { leagues_id: 12 } }, { registration_window_id: 1, starts_at: 50, ends_at: 350 }).overlap_ok, false);
});

test('періоди — лише з правом 21; клубний токен їх не відкриває', () => {
  for (const ф of ['registration-windows.get.xs', 'registration-windows.post.xs', 'registration-windows-id.patch.xs', 'registration-rules-id.put.xs']) {
    const s = fs.readFileSync(new URL(`../../xano/crm/${ф}`, import.meta.url), 'utf8');
    assert.match(s, /^\s*auth = "Users"$/m, ф);
    assert.match(s, /input = \{id_access_rights: 21, user_id: \$auth\.id\}/, ф);
    assert.ok(s.indexOf('id_access_rights: 21') < s.indexOf('db.'), `${ф}: право перевіряється до читання`);
  }
});
