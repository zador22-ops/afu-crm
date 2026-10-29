import { test } from 'node:test';
import assert from 'node:assert/strict';
import { новаСесія, обранийКлуб, перенаправлення, режим, розібрати, хвилинЛишилось, чинна } from './clubSession.js';

const ЗАРАЗ = 1_800_000_000_000;

test('розбір збереженої сесії: зіпсоване й без токена — null', () => {
  assert.equal(розібрати(null), null);
  assert.equal(розібрати('не json'), null);
  assert.equal(розібрати('{"token":""}'), null);
  assert.deepEqual(розібрати('{"token":"t","as_admin":true}'), { token: 't', as_admin: true });
});

test('нова сесія: вхід клубу — 12 год; «як клуб» — expires_in і позначка Адміна', () => {
  const s = новаСесія({ authToken: 'a', account: { id: 1, name: 'Сокіл', email: 'x@y.z' } }, { now: ЗАРАЗ });
  assert.deepEqual(s, { token: 'a', expires_at: ЗАРАЗ + 12 * 3600_000, as_admin: false, account: { id: 1, name: 'Сокіл' } });
  const a = новаСесія({ authToken: 'b', account: { id: 1, name: 'Сокіл' }, expires_in: 3600 }, { as_admin: true, now: ЗАРАЗ });
  assert.equal(a.expires_at, ЗАРАЗ + 3600_000);
  assert.equal(a.as_admin, true);
  assert.equal('email' in s.account, false); // пошту в сховище не кладемо
});

test('чинність і хвилини до кінця', () => {
  const s = { token: 't', expires_at: ЗАРАЗ + 90_000 };
  assert.equal(чинна(s, ЗАРАЗ), true);
  assert.equal(чинна(s, ЗАРАЗ + 90_000), false);
  assert.equal(чинна(null, ЗАРАЗ), false);
  assert.equal(хвилинЛишилось(s, ЗАРАЗ), 2);
  assert.equal(хвилинЛишилось(s, ЗАРАЗ + 100_000), 0);
});

test('режим: чинна сесія клубу важить більше за токен АФУ; сплила — назад до АФУ', () => {
  const клуб = { token: 'c', expires_at: ЗАРАЗ + 1000 };
  const якКлуб = { ...клуб, as_admin: true };
  assert.equal(режим({ staff: true, club: якКлуб, now: ЗАРАЗ }), 'club-admin');
  assert.equal(режим({ staff: false, club: клуб, now: ЗАРАЗ }), 'club');
  assert.equal(режим({ staff: true, club: { ...якКлуб, expires_at: ЗАРАЗ - 1 }, now: ЗАРАЗ }), 'staff');
  assert.equal(режим({ staff: false, club: null, now: ЗАРАЗ }), 'anon');
});

test('маршрути: представник не відкриває сторінок АФУ навіть за прямою адресою', () => {
  for (const р of ['club', 'club-admin']) {
    for (const шлях of ['/', '/seasons', '/users', '/matches/5', '/settings', '/data-issues', '/login', '/club/login', '/clubs/58'])
      assert.equal(перенаправлення(р, шлях), '/club', `${р} ${шлях}`);
    assert.equal(перенаправлення(р, '/club'), null);
    assert.equal(перенаправлення(р, '/club/58'), null);
  }
});

test('маршрути: співробітник не заходить у кабінет клубу без «як клуб»; вхід клубу йому доступний', () => {
  // з кабінету — на «Акаунти клубів»: так повертається Адмін після «як клуб»
  assert.equal(перенаправлення('staff', '/club'), '/users?tab=clubs');
  assert.equal(перенаправлення('staff', '/club/58'), '/users?tab=clubs');
  assert.equal(перенаправлення('staff', '/club/login'), null);
  assert.equal(перенаправлення('staff', '/clubs/58'), null); // сторінка клубу АФУ — це інше
  assert.equal(перенаправлення('staff', '/users'), null);
});

test('маршрути: без входу — лише два входи', () => {
  assert.equal(перенаправлення('anon', '/login'), null);
  assert.equal(перенаправлення('anon', '/club/login'), null);
  assert.equal(перенаправлення('anon', '/club'), '/club/login');
  assert.equal(перенаправлення('anon', '/seasons'), '/login');
});

test('перемикач клубу: збережений, якщо ще доступний, інакше перший', () => {
  const clubs = [{ teaminfo_id: 20 }, { teaminfo_id: 21 }];
  assert.equal(обранийКлуб(clubs, 21), 21);
  assert.equal(обранийКлуб(clubs, '21'), 21);
  assert.equal(обранийКлуб(clubs, 99), 20); // прив'язку зняли — перший
  assert.equal(обранийКлуб(clubs, null), 20);
  assert.equal(обранийКлуб([], 20), null);
});
