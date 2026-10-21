import { test } from 'node:test';
import assert from 'node:assert/strict';
import { мійМатч, поточнийСезон, упорядкувати, чиДелегат } from './myMatches.js';

test('делегат — роль 2 (з auth/me), рядком теж', () => {
  assert.equal(чиДелегат({ types_of_user_roles_id: 2 }), true);
  assert.equal(чиДелегат({ types_of_user_roles_id: '2' }), true);
  assert.equal(чиДелегат({ types_of_user_roles_id: 1 }), false); // адмін
  assert.equal(чиДелегат({ types_of_user_roles_id: 3 }), false); // повний перегляд
  assert.equal(чиДелегат(null), false);
});

test('мій матч — за users_idDelegat', () => {
  assert.equal(мійМатч({ users_idDelegat: 17 }, 17), true);
  assert.equal(мійМатч({ users_idDelegat: '17' }, 17), true);
  assert.equal(мійМатч({ users_idDelegat: 18 }, 17), false);
  assert.equal(мійМатч({ users_idDelegat: 0 }, undefined), false);
  assert.equal(мійМатч({}, 17), false);
});

test('поточний сезон — is_current, інакше перший', () => {
  assert.equal(поточнийСезон([{ id: 1 }, { id: 2, is_current: true }]).id, 2);
  assert.equal(поточнийСезон([{ id: 5 }, { id: 4 }]).id, 5);
  assert.equal(поточнийСезон([]), null);
});

test('найближчі зверху: ті, що йдуть, потім майбутні, потім минулі від свіжих', () => {
  const H = 3600 * 1000;
  const now = 1_000 * H;
  const m = (id, годин, status = 1) => ({ id, TimeOfMatch: now + годин * H, match_status_id: status });
  const список = [
    m('минулий-давній', -72, 4),
    m('завтра', 24),
    m('пауза', -1, 5),
    m('минулий-вчора', -24, 4),
    m('через-годину', 1),
    m('почався-годину-тому', -1, 1), // статус ще «Запланований», а гра йде
    m('онлайн', -0.5, 3),
  ];
  assert.deepEqual(
    упорядкувати(список, now).map((x) => x.id),
    // ті, що йдуть, — між собою за часом початку
    ['пауза', 'онлайн', 'почався-годину-тому', 'через-годину', 'завтра', 'минулий-вчора', 'минулий-давній']
  );
  assert.deepEqual(упорядкувати(undefined, now), []);
});
