import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// CAS v2 (AFU docs/xano/club-self-service-cas-v2.md): переходи статусу заявок і пакетів — без SQL-записів
// (x1_<id> у Xano — view, UPDATE/DELETE дають 0A000, жива перевірка А2 30.10). Кожен перехід: замок
// change_lock з унікальним ключем + записи в одній транзакції; конфлікт — за станом (чи є ключ), поза
// транзакцією. Тут — правила для всіх клубних і moderation-файлів і лямбди переходів на фікстурах.
const ТЕКА = new URL('../../xano/crm/', import.meta.url);
const читати = (f) => fs.readFileSync(new URL(f, ТЕКА), 'utf8');
const файли = fs.readdirSync(ТЕКА).filter((f) => /^(club-|moderation-|registration-)/.test(f) && f.endsWith('.xs'));

// Кінець блоку { … } від позиції відкривної дужки (дужки в JS лямбд збалансовані)
const кінецьБлоку = (s, від) => {
  let г = 0;
  for (let i = s.indexOf('{', від); i < s.length; i++) {
    if (s[i] === '{') г++;
    else if (s[i] === '}' && --г === 0) return i;
  }
  return -1;
};
const транзакції = (s) => [...s.matchAll(/db\.transaction \{/g)].map((м) => [м.index, кінецьБлоку(s, м.index)]);

test('жодного db.direct_query з UPDATE / DELETE / INSERT у клубних, moderation і registration .xs', () => {
  for (const f of файли) {
    for (const [, sql] of читати(f).matchAll(/db\.direct_query \{\s*sql = """([\s\S]*?)"""/g)) {
      assert.doesNotMatch(sql, /\b(UPDATE|DELETE|INSERT)\b/i, `${f}: запис через direct_query`);
    }
  }
});

test('кожна зміна status заявки / пакета і кожне видалення заявки — всередині транзакції після замка change_lock', () => {
  // Виняток (контракт, розділ 4): закриття пакета — без замка, лише рішеннями або ліниво в GET moderation/batches
  const виняток = (f, тіло) => f === 'moderation-batches.get.xs' && /status: "closed"/.test(тіло);
  let переходів = 0;
  for (const f of файли) {
    const s = читати(f);
    const тр = транзакції(s);
    const перевірити = (поз, що) => {
      const в = тр.find(([a, b]) => a < поз && поз < b);
      assert.ok(в, `${f}: ${що} поза транзакцією`);
      const замок = s.slice(в[0], поз).indexOf('db.add change_lock');
      assert.ok(замок >= 0, `${f}: ${що} без замка change_lock перед ним у транзакції`);
      переходів++;
    };
    for (const м of s.matchAll(/db\.edit change_(request|batch) \{([\s\S]*?)\} as \$/g)) {
      if (!/\bstatus\s*:/.test(м[2]) || виняток(f, м[2])) continue;
      // закриття пакета в транзакції рішення — гаразд (усередині тієї ж транзакції, де ключ долі пакета)
      перевірити(м.index, `db.edit change_${м[1]} зі status`);
    }
    for (const м of s.matchAll(/db\.del change_request \{/g)) перевірити(м.index, 'db.del change_request');
  }
  assert.ok(переходів >= 20, `переходів знайдено ${переходів}`);
});

test('ключі замків — за контрактом: cr:<id>:<rev>, batch:<id>:fate, person:<cr_id>', () => {
  const ключі = new Set();
  for (const f of файли) for (const [к] of читати(f).matchAll(/'(cr|batch|person):'/g)) ключі.add(к);
  assert.deepEqual([...ключі].sort(), ["'batch:'", "'cr:'", "'person:'"]);
  for (const f of файли) {
    const s = читати(f);
    // лише лямбди переходів $tr_… і лікування $heal (open_key 'club:' / 'squad:' — інше)
    const коди = [...s.matchAll(/code = """([\s\S]*?)"""\s*timeout = \d+\s*\} as \$(\w+)/g)].filter((м) => /^(tr_\w+|heal)$/.test(м[2])).map((м) => м[1]).join('\n');
    for (const [, в] of коди.matchAll(/key: '(\w+):' \+/g)) assert.ok(['cr', 'person'].includes(в), `${f}: невідомий ключ ${в}`);
    // cr: завжди з версією
    for (const м of коди.matchAll(/'cr:' \+ ([^;,}]+?) \+ ':' \+ ([^;,}]+)/g)) assert.match(м[2], /rev/, `${f}: cr: без rev`);
  }
  assert.match(читати('club-clubs-id-batches-id-withdraw.post.xs'), /return 'batch:' \+ \$input\.batch_id \+ ':fate';/);
});

test('конфлікт — за станом: після невдалої транзакції db.get change_lock за ключем, без розбору тексту помилки', () => {
  for (const f of файли) {
    const s = читати(f);
    assert.doesNotMatch(s, /\$error/, `${f}: текст помилки Xano не читаємо`);
    const блоки = [...s.matchAll(/\} as \$tr_(\w+)\n/g)].map((м) => м[1]);
    for (const n of блоки) {
      assert.match(s, new RegExp(`if \\(\\$ok_${n} == false\\) \\{\\s*foreach \\(\\$tr_${n}\\.keys\\) \\{\\s*each as \\$hk \\{\\s*db\\.get change_lock \\{\\s*field_name = "key"`), `${f}: ${n} — немає перевірки ключів за станом`);
      // db.get ключів — ПОЗА транзакцією (у зламаній транзакції Postgres запит не пройде)
      const поз = s.indexOf(`if ($ok_${n} == false)`);
      assert.ok(!транзакції(s).some(([a, b]) => a < поз && поз < b), `${f}: ${n} — перевірка ключів усередині транзакції`);
    }
  }
});

test('запасний варіант 3.3 — мала правка: обгортка транзакції між позначками, прибирання своїх ключів уже в catch', () => {
  for (const f of файли) {
    const s = читати(f);
    const позначки = [...s.matchAll(/\/\/ ТРАНЗАКЦІЯ ([↓↑])/g)].map((м) => м[1]).join('');
    if (!позначки) continue;
    assert.match(позначки, /^(↓↑↓↑)+$/, `${f}: позначки обгортки не парні`);
    // Прибрати рядки між ↓ і ↑ — дужки лишаються збалансованими, db.transaction зникає
    const без = s.replace(/[^\n]*\/\/ ТРАНЗАКЦІЯ ↓\n[\s\S]*?\/\/ ТРАНЗАКЦІЯ ↑\n/g, '');
    assert.equal((без.match(/\{/g) || []).length, (без.match(/\}/g) || []).length, `${f}: після прибирання обгортки дужки не збігаються`);
    assert.doesNotMatch(без, /db\.transaction \{/, `${f}: транзакція без позначок запасного варіанта`);
    for (const [, n] of s.matchAll(/var \$mine_(\w+) \{/g)) {
      // свої замки прибираються за id СВОГО рядка, не за key (рецензія Backend: за key можна стерти чужий замок)
      assert.match(s, new RegExp(`value = \\$mine_${n}\\|push:\\$lock_${n}\\.id`), `${f}: ${n} — у $mine має йти id замка`);
      assert.match(s, new RegExp(`foreach \\(\\$mine_${n}\\) \\{\\s*each as \\$mk \\{\\s*try_catch \\{\\s*try \\{\\s*db\\.del change_lock \\{\\s*field_name = "id"`), `${f}: ${n} — прибирання не за id`);
    }
  }
});

test('незадані nullable int — null, не 0: жодних порівнянь полів-посилань з 0 (прохання Backend)', () => {
  const ПОЛЯ = 'acted_by_users_id|batch_id|entity_id|leagues_id|people_id|depends_on_id|transfer_from_team_id|transfer_from_teaminfo_id|decision_users_id|applied_entity_id|created_by_users_id|updated_by_users_id|change_request_id|approved_by_users_id';
  const нуль = new RegExp(`\\b(${ПОЛЯ})\\s*(==|!=|===|!==|>|<=)\\s*0\\b|\\b(${ПОЛЯ})\\s*\\|\\|\\s*0\\b|\\b(${ПОЛЯ}):\\s*0\\b`);
  for (const f of файли) assert.doesNotMatch(читати(f), нуль, f);
});

// ——— Лямбди переходів на фікстурах ———
const лямбда = (файл, ім) => {
  const xs = читати(файл);
  const кінець = xs.search(new RegExp(`\\} as \\$${ім}\\n`));
  assert.ok(кінець > 0, `${файл}: немає $${ім}`);
  const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
  return new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'));
};

test('чернетка: змінити / видалити — замок cr:<id>:<rev>, rev + 1', () => {
  assert.deepEqual(лямбда('club-clubs-id-draft.put.xs', 'tr_edit')({ open: { id: 5, rev: 2 } }, {}), { keys: [{ key: 'cr:5:2', op: 'edit', request_id: 5, batch_id: null }], rev: 3 });
  assert.deepEqual(лямбда('club-clubs-id-draft.put.xs', 'tr_delete')({ open: { id: 5, rev: null } }, {}).keys[0].key, 'cr:5:0');
  assert.equal(лямбда('club-clubs-id-draft.delete.xs', 'tr_delete')({ draft: { id: 7, rev: 4 } }, {}).keys[0].key, 'cr:7:4');
  for (const [ф, n] of [['club-clubs-id-players-id.put.xs', 'edit_squad'], ['club-clubs-id-staff-id.put.xs', 'edit_staff'], ['club-clubs-id-players-id.put.xs', 'del_person']]) {
    const відкрита = n === 'edit_squad' ? 'open_squad' : n === 'edit_staff' ? 'open_staff' : 'open_person';
    assert.equal(лямбда(ф, `tr_${n}`)({ [відкрита]: { id: 9, rev: 1 } }, {}).keys[0].key, 'cr:9:1', `${ф} ${n}`);
  }
});

test('submit: замок на кожну чернетку за зростанням id; рядки — before і rev + 1', () => {
  const r = лямбда('club-clubs-id-submit.post.xs', 'tr_submit')({ drafts: [{ id: 12, rev: 1 }, { id: 10, rev: 0 }], plan: { rows: [{ id: 12, before: { a: 1 } }, { id: 10, before: null }] } }, {});
  assert.deepEqual(r.keys.map((k) => k.key), ['cr:10:0', 'cr:12:1']);
  assert.deepEqual(r.rows, [{ id: 10, before: null, rev: 1 }, { id: 12, before: { a: 1 }, rev: 2 }]);
  const s = читати('club-clubs-id-submit.post.xs');
  // пакет і рядки — в одній транзакції: порожнього пакета не буває (стара гілка «видалити порожній» прибрана)
  assert.doesNotMatch(s, /db\.del change_batch/);
  assert.ok(s.indexOf('db.add change_batch') > s.indexOf('db.transaction {'));
});

test('withdraw: доля пакета спершу читається; ключ batch:<id>:fate першим, далі cr: рядків', () => {
  const перевірка = лямбда('club-clubs-id-batches-id-withdraw.post.xs', 'check');
  assert.deepEqual(перевірка({ fate: null, rows: [{ status: 'submitted' }], batch: { has_decision: false } }, {}), { fate_ok: true, rows_ok: true });
  assert.equal(перевірка({ fate: { op: 'decided' }, rows: [{ status: 'submitted' }], batch: {} }, {}).fate_ok, false);
  assert.equal(перевірка({ fate: null, rows: [{ status: 'applied' }], batch: {} }, {}).rows_ok, false);
  const r = лямбда('club-clubs-id-batches-id-withdraw.post.xs', 'tr_withdraw')({ batch: { id: 5, rev: 1 }, fate_key: 'batch:5:fate', rows: [{ id: 21, rev: 1 }, { id: 20, rev: 0 }] }, {});
  assert.deepEqual(r.keys.map((k) => [k.key, k.op]), [['batch:5:fate', 'withdrawn'], ['cr:20:0', 'withdraw'], ['cr:21:1', 'withdraw']]);
  assert.equal(r.batch_rev, 2);
});

test('видалення чернетки: разом із залежними й осиротілою новою особою; не draft — відмова', () => {
  const план = лямбда('club-clubs-id-requests-id.delete.xs', 'plan');
  const рядки = [
    { id: 50, status: 'draft', depends_on_id: null, rev: 0 },
    { id: 51, status: 'draft', depends_on_id: 50, rev: 1 },
    { id: 52, status: 'draft', depends_on_id: 50, rev: 0 },
  ];
  // рядок складу нової особи: особа лишається, бо на неї посилається 52
  assert.deepEqual(план({ club_rows: рядки, request: { depends_on_id: 50 } }, { request_id: 51 }).targets.map((r) => r.id), [51]);
  // останній рядок — особа-сирота теж
  assert.deepEqual(план({ club_rows: рядки.filter((r) => r.id !== 52), request: { depends_on_id: 50 } }, { request_id: 51 }).targets.map((r) => r.id), [50, 51]);
  // сама нова особа — з усіма рядками
  assert.deepEqual(план({ club_rows: рядки, request: { depends_on_id: null } }, { request_id: 50 }).targets.map((r) => r.id), [50, 51, 52]);
  assert.equal(план({ club_rows: [{ ...рядки[0] }, { ...рядки[1], status: 'submitted' }], request: {} }, { request_id: 50 }).all_draft, false);
  const ключі = лямбда('club-clubs-id-requests-id.delete.xs', 'tr_delete')({ plan: { targets: [{ id: 50, rev: 0 }, { id: 51, rev: 1 }] } }, {}).keys;
  assert.deepEqual(ключі.map((k) => k.key), ['cr:50:0', 'cr:51:1']);
});

// Пакет: 50 — нова особа, 51 / 52 — її рядки складу, 60 — картка
const пакет = (зміни = {}) => [
  { id: 50, entity: 'person', action: 'create', status: 'submitted', depends_on_id: null, rev: 1 },
  { id: 51, entity: 'squad_row', action: 'create', status: 'submitted', depends_on_id: 50, rev: 1 },
  { id: 52, entity: 'squad_row', action: 'create', status: 'submitted', depends_on_id: 50, rev: 1 },
  { id: 60, entity: 'club', action: 'update', status: 'submitted', depends_on_id: null, rev: 1 },
].map((r) => ({ ...r, ...(зміни[r.id] || {}) }));

test('«Повернути»: доля пакета (якщо ще немає), cr: рядка; нова особа без застосованих рядків — rejected; пакет закривається', () => {
  const tr = лямбда('moderation-requests-id-reject.post.xs', 'tr_reject');
  const r1 = tr({ row: { id: 51, batch_id: 5, rev: 1 }, batch: { rev: 0 }, fate: null, fate_key: 'batch:5:fate', batch_rows: пакет() }, {});
  assert.deepEqual(r1.keys.map((k) => k.key), ['batch:5:fate', 'cr:51:1']);
  assert.deepEqual([r1.persons, r1.close], [[], false]);
  // другий рядок особи повертають, перший уже повернуто, картку погоджено → особа rejected, пакет closed
  const r2 = tr({ row: { id: 52, batch_id: 5, rev: 1 }, batch: { rev: 1 }, fate: { op: 'decided' }, fate_key: 'batch:5:fate', batch_rows: пакет({ 51: { status: 'rejected' }, 60: { status: 'applied' } }) }, {});
  assert.deepEqual(r2.keys.map((k) => [k.key, k.op]), [['cr:50:1', 'final'], ['cr:52:1', 'reject']]);
  assert.deepEqual(r2.persons, [{ id: 50, lock_rev: 1, rev: 2, status: 'rejected' }]);
  assert.equal(r2.close, true);
  // один із рядків failed → особа failed
  const r3 = tr({ row: { id: 52, batch_id: 5, rev: 1 }, batch: {}, fate: { op: 'decided' }, fate_key: 'f', batch_rows: пакет({ 51: { status: 'failed' } }) }, {});
  assert.equal(r3.persons[0].status, 'failed');
});

const застосування = (зміни, плану = {}) =>
  лямбда('moderation-requests-id-approve.post.xs', 'tr_apply')({ row: { id: 51, batch_id: 5, rev: 1, depends_on_id: 50 }, batch: { rev: 3 }, fate: null, fate_key: 'batch:5:fate', parent_list: [{ id: 50, status: 'submitted', rev: 1 }], batch_rows: пакет(зміни), plan: { ok: true, person: { request_id: 50 }, ...плану } }, {});

test('«Погодити»: один перехід submitted → applied — доля пакета, person:<cr_id>, cr: рядка й особи', () => {
  const r = застосування({});
  assert.deepEqual(r.keys.map((k) => [k.key, k.op]), [['batch:5:fate', 'decided'], ['person:50', 'claim'], ['cr:50:1', 'apply'], ['cr:51:1', 'apply']]);
  assert.deepEqual([r.rev, r.parent_rev, r.person_key, r.row_key, r.batch_rev], [2, 2, 'person:50', 'cr:51:1', 4]);
  // наявна особа — без person: і без cr: особи
  assert.deepEqual(застосування({}, { person: null }).keys.map((k) => k.key), ['batch:5:fate', 'cr:51:1']);
  // останній рядок пакета — закриття
  assert.equal(застосування({ 52: { status: 'rejected' }, 60: { status: 'applied' } }).close, true);
  const s = читати('moderation-requests-id-approve.post.xs');
  assert.doesNotMatch(s, /status: "approved"|status = 'approved'/, 'проміжного approved більше немає');
  // нова особа й кроки — у транзакції застосування, план і HEAD — до неї
  const [від, до] = транзакції(s).find(([a, b]) => a < s.indexOf('db.add People {') && s.indexOf('db.add People {') < b);
  assert.ok(від < s.indexOf('foreach ($steps)') && s.indexOf('foreach ($steps)') < до);
  assert.ok(s.indexOf('} as $plan_try') < від && s.indexOf('foreach ($image_paths)') < від);
});

test('«Погодити» не вдалось: особа зайнята іншим → 400; лише доля пакета → «спробуйте ще раз»; інший ключ → 409; ключі вільні → failed «нічого не змінено»', () => {
  const чому = лямбда('moderation-requests-id-approve.post.xs', 'why');
  const t = { person_key: 'person:50', row_key: 'cr:51:1' };
  const з = (h) => чому({ held_apply: h, tr_apply: t, fate_key: 'batch:5:fate' }, {});
  assert.deepEqual(з(['person:50']), { busy: true, retry: false, conflict: false });
  assert.deepEqual(з(['cr:51:1', 'person:50']), { busy: false, retry: false, conflict: true });
  // лише доля пакета — паралельне перше рішення по іншому рядку: «спробуйте ще раз»
  assert.deepEqual(з(['batch:5:fate']), { busy: false, retry: true, conflict: false });
  assert.deepEqual(з(['batch:5:fate', 'cr:51:1']), { busy: false, retry: false, conflict: true });
  assert.deepEqual(з([]), { busy: false, retry: false, conflict: false });
  const ще = лямбда('moderation-requests-id-reject.post.xs', 'retry_reject');
  assert.equal(ще({ held_reject: ['batch:5:fate'], fate_key: 'batch:5:fate' }, {}), true);
  assert.equal(ще({ held_reject: ['batch:5:fate', 'cr:51:1'], fate_key: 'batch:5:fate' }, {}), false);
  assert.equal(ще({ held_reject: [], fate_key: 'batch:5:fate' }, {}), false);
  assert.match(читати('moderation-requests-id-approve.post.xs'), /Помилка запису в Xano під час застосування — нічого не змінено \(усе відкочено\)/);
});

test('failed: нова особа не пройшла правила — її заявка й інші рядки, що чекають, теж failed', () => {
  const tr = лямбда('moderation-requests-id-approve.post.xs', 'tr_fail');
  const з = { row: { id: 51, batch_id: 5, rev: 1, depends_on_id: 50 }, batch: { rev: 0 }, fate: null, fate_key: 'batch:5:fate', parent_list: [{ id: 50, status: 'submitted', rev: 1 }], siblings: [{ id: 51, status: 'submitted', rev: 1 }, { id: 52, status: 'submitted', rev: 1 }], batch_rows: пакет() };
  const r = tr({ ...з, plan: { ok: false, person_failed: true } }, {});
  assert.deepEqual(r.keys.map((k) => [k.key, k.op]), [['batch:5:fate', 'decided'], ['cr:50:1', 'fail'], ['cr:51:1', 'fail'], ['cr:52:1', 'fail']]);
  assert.deepEqual(r.family, [{ id: 50, rev: 2 }, { id: 52, rev: 2 }]);
  // особа впала не через себе (напр. номер зайнятий) — лише сам рядок
  const р2 = tr({ ...з, plan: { ok: false, person_failed: false } }, {});
  assert.deepEqual(р2.keys.map((k) => k.key), ['batch:5:fate', 'cr:51:1']);
  assert.deepEqual(р2.family, []);
});

test('GET moderation/batches лагодить: нова особа без застосованих рядків — final; пакет закривається за фактичним станом', () => {
  const ліки = лямбда('moderation-batches.get.xs', 'heal');
  const р = пакет({ 51: { status: 'rejected' }, 52: { status: 'failed' }, 60: { status: 'applied' } }).map((x) => ({ ...x, batch_id: 5 }));
  const r = ліки({ open_batches: [{ id: 5 }], heal_rows: р }, {});
  assert.deepEqual(r.persons, [{ id: 50, lock_rev: 1, rev: 2, status: 'failed', key: 'cr:50:1' }]);
  assert.deepEqual(r.close, [], 'особа ще submitted — пакет закриється наступного разу');
  const r2 = ліки({ open_batches: [{ id: 5 }], heal_rows: р.map((x) => (x.id === 50 ? { ...x, status: 'failed' } : x)) }, {});
  assert.deepEqual([r2.persons, r2.close], [[], [5]]);
});
