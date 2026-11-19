import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Telegram клубу в картці CRM АФУ (Богдан, чат АФУ 19.11): поле поруч з Instagram / Facebook / YouTube,
// у стані форми й у тілі PATCH clubs/{id}; сервер приймає text telegram? (колонка TeamInfo.telegram — Backend)
const сторінка = fs.readFileSync(new URL('../pages/ClubPage.jsx', import.meta.url), 'utf8');
const patch = fs.readFileSync(new URL('../../xano/crm/clubs-id.patch.xs', import.meta.url), 'utf8');

test('Telegram: форма, тіло збереження й стан — так само, як YouTube', () => {
  assert.match(сторінка, /<Field label="Telegram">\s*<input value=\{values\.telegram\} onChange=\{set\('telegram'\)\}/);
  assert.match(сторінка, /telegram: values\.telegram\.trim\(\),/);
  assert.match(сторінка, /telegram: c\.telegram \|\| '',/);
  // поруч із YouTube, у секції «Контакти й мережі»
  assert.ok(сторінка.indexOf('label="Telegram"') > сторінка.indexOf('label="YouTube"'));
});

test('Telegram: PATCH clubs/{id} приймає telegram (trim), як інші соцмережі', () => {
  assert.match(patch, /text telegram\? filters=trim/);
  // записується тим самим pick за ключами тіла, що й решта полів
  assert.match(patch, /data = `\$input\|pick:\(\$raw\|keys\)\|unset:"teaminfo_id"`/);
});
