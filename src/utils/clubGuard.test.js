import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Самообслуговування клубів, задача 1.2: перевірки самих файлів .xs (живий
// Xano тут не викликається). Нові клубні ендпоінти мусять:
// - мати auth на club_account (не Users) — тоді токен клубу не відкриває
//   жодного наявного ендпоінта, а токен співробітника — клубних;
// - перевіряти «лише свій клуб» ТИМ САМИМ текстом сторожа до будь-якого
//   читання даних клубу;
// - не писати в основні таблиці (до погодження АФУ — нічого напряму).
const ТЕКА = new URL('../../xano/crm/', import.meta.url);
const файли = fs.readdirSync(ТЕКА).filter((f) => f.endsWith('.xs'));
const читати = (f) => fs.readFileSync(new URL(f, ТЕКА), 'utf8');
const клубні = файли.filter((f) => f.startsWith('club-') && !f.startsWith('club-accounts'));
const акаунтів = файли.filter((f) => f.startsWith('club-accounts'));

// Еталон сторожа — з club-clubs-id.get.xs, між «// СТОРОЖ» і «// /СТОРОЖ»
const еталон = (() => {
  const s = читати('club-clubs-id.get.xs');
  return s.slice(s.indexOf('    db.get club_account {'), s.indexOf('    // /СТОРОЖ')).trim();
})();
const ОСНОВНІ = ['TeamInfo', 'People', 'Team', '"Administration of teams"', 'Match', 'Statistic', 'Zaiuavka', 'Venues', 'Users', 'Leagues', 'Table'];

test('є клубні ендпоінти й ендпоінти акаунтів', () => {
  assert.ok(клубні.length >= 3, клубні.join(','));
  assert.ok(акаунтів.length >= 4, акаунтів.join(','));
  assert.match(еталон, /\$db\.club_account_club\.teaminfo_id == \$input\.teaminfo_id/);
  assert.match(еталон, /error = "Це не ваш клуб"/);
  assert.match(еталон, /\$guard_account\.is_active/);
});

test('клубні ендпоінти — auth на club_account (вхід — без auth)', () => {
  for (const f of клубні) {
    const s = читати(f);
    if (f === 'club-auth-login.post.xs') {
      assert.doesNotMatch(s, /^\s*auth = /m, f);
      assert.match(s, /security\.check_password/, f);
      assert.match(s, /table = "club_account"/, f);
    } else {
      assert.match(s, /^\s*auth = "club_account"$/m, f);
    }
    assert.doesNotMatch(s, /auth = "Users"/, f);
  }
});

test('кожен клубний ендпоінт із teaminfo_id має сторож дослівно — і до читання даних клубу', () => {
  const зКлубом = клубні.filter((f) => /^\s*int teaminfo_id/m.test(читати(f)));
  assert.ok(зКлубом.length >= 1);
  for (const f of зКлубом) {
    const s = читати(f);
    const де = s.indexOf(еталон);
    assert.ok(де > 0, `${f}: немає сторожа «лише свій клуб» (текст має бути дослівно як у club-clubs-id.get.xs)`);
    for (const т of ОСНОВНІ) {
      const читання = s.search(new RegExp(`db\\.(get|query) ${т.replace(/"/g, '"')} \\{`));
      if (читання !== -1) assert.ok(читання > де + еталон.length, `${f}: ${т} читається до сторожа`);
    }
  }
});

test('клубні ендпоінти не пишуть в основні таблиці', () => {
  for (const f of клубні) {
    const s = читати(f);
    for (const т of ОСНОВНІ) assert.doesNotMatch(s, new RegExp(`db\\.(add|edit|patch|del|add_or_edit) ${т} \\{`), `${f} пише в ${т}`);
  }
});

test('ендпоінти акаунтів — Users і право 22 першою дією', () => {
  for (const f of акаунтів) {
    const s = читати(f);
    assert.match(s, /^\s*auth = "Users"$/m, f);
    const стек = s.slice(s.indexOf('stack {'));
    assert.match(стек, /^stack \{\s*function\.run "Check access rights" \{\s*input = \{id_access_rights: 22, user_id: \$auth\.id\}/, f);
  }
});

test('пароль не віддається й не читається в output', () => {
  for (const f of [...клубні, ...акаунтів]) {
    const s = читати(f);
    for (const [, список] of s.matchAll(/output = \[([^\]]*)\]/g)) assert.doesNotMatch(список, /password/, `${f}: password в output`);
    const відповідь = s.slice(s.lastIndexOf('response ='));
    assert.doesNotMatch(відповідь, /\$(was|same_email|guard_account)\b/, `${f}: у відповіді цілий рядок акаунта`);
    // $account у відповіді — лише окремими полями, або це вже вибірка без пароля (output)
    if (/\$account\b(?!\.)/.test(відповідь)) assert.match(s, /db\.get club_account \{[^}]*output = \[/, `${f}: $account цілком у відповіді`);
  }
});

test('«увійти як клуб» — токен club_account на 1 год з Адміном в extras', () => {
  const s = читати('club-accounts-id-impersonate.post.xs');
  assert.match(s, /table = "club_account"/);
  assert.match(s, /extras = \{acted_by_users_id: \$auth\.id\}/);
  assert.match(s, /expiration = 3600/);
  assert.match(читати('club-me.get.xs'), /value = \$auth\.extras\|get:"acted_by_users_id":null/);
});

test('extras токена — лише через |get: при звичайному вході extras = {}, і пряме поле дає 500', () => {
  for (const f of [...клубні, ...акаунтів]) assert.doesNotMatch(читати(f), /\$auth\.extras\./, f);
});

test('вхід: пароль перевіряється й для невідомої пошти (фіктивний хеш) — однаковий час', () => {
  const s = читати('club-auth-login.post.xs');
  const перевірка = s.indexOf('security.check_password');
  const відмова = s.indexOf('precondition ($account != null && $pass_ok)');
  assert.ok(перевірка > 0 && відмова > перевірка, 'check_password має стояти ДО відмови за відсутньою поштою');
  assert.doesNotMatch(s, /precondition \(\$account != null\) \{/, 'окрема відмова «пошти немає» до перевірки пароля');
  assert.match(s, /hash_password = \$hash/);
  assert.match(s, /const д = String\.fromCharCode\(36\);\s*return д \+ '2y' \+ д \+ '10' \+ д \+ '[.\/A-Za-z0-9]{53}';/);
});

test('наявні ендпоінти crm не посилаються на клубні таблиці', () => {
  for (const f of файли.filter((x) => !x.startsWith('club-'))) assert.doesNotMatch(читати(f), /club_account/, f);
});
