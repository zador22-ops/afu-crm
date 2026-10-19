import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ПОПЕРЕДЖЕННЯ, ПРИЧИНА_МІН, можнаПеренести, причинаГодиться } from './postpone.js';

test('кнопка — лише для «Онлайн» і «Зіграного»', () => {
  assert.equal(можнаПеренести(3), true);
  assert.equal(можнаПеренести(4), true);
  assert.equal(можнаПеренести('4'), true); // статус приходить і рядком
  assert.equal(можнаПеренести(1), false); // запланований переносять у картці розкладу
  assert.equal(можнаПеренести(2), false); // уже перенесений
  assert.equal(можнаПеренести(undefined), false);
});

test('причина — щонайменше 3 символи без пробілів по краях', () => {
  assert.equal(причинаГодиться('Дощ'), true);
  assert.equal(причинаГодиться('  ab  '), false);
  assert.equal(причинаГодиться(''), false);
  assert.equal(причинаГодиться(undefined), false);
});

test('сервер вимагає те саме: статуси 3/4, причина ≥ 3, пуш за статусом', () => {
  const xs = fs.readFileSync(new URL('../../xano/crm/matches-id-postpone.post.xs', import.meta.url), 'utf8');
  assert.match(xs, /query "matches\/\{match_id\}\/postpone" verb=POST/);
  assert.match(xs, /\$was\.match_status_id == 3 \|\| \$was\.match_status_id == 4/);
  assert.match(xs, new RegExp(`причина\\.length >= ${ПРИЧИНА_МІН}`));
  assert.match(xs, /match_status_id: 2/);
  assert.match(xs, /"CRM table recalc"/);
  assert.match(xs, /type_of_event: "status"/);
  // Події протоколу не видаляються: жодного db.del у ендпоінті
  assert.doesNotMatch(xs, /db\.del/);
});

test('попередження — слово в слово з брифа (те саме покаже ADMIN 2.0)', () => {
  assert.equal(
    ПОПЕРЕДЖЕННЯ,
    'Матч зникне з турнірної таблиці. Події протоколу залишаться, але не рахуватимуться, доки матч не зіграють.'
  );
});

test('пуш перенесеного після початку — без «тепер <минулий час>», шаблон є в скрипті', () => {
  const fn = fs.readFileSync(new URL('../../xano/functions/push-v2-match-status.xs', import.meta.url), 'utf8');
  const скрипт = fs.readFileSync(new URL('../../xano/push-template-postponed-nodate.mjs', import.meta.url), 'utf8');
  assert.match(fn, /const попереду = Number\(c\.time\) > Date\.now\(\);/);
  assert.match(fn, /попереду \? 'тепер ' \+ коли\(c\.time\) : 'нову дату повідомимо'/);
  assert.match(fn, /kind === 'match_postponed' && !попереду \? 'match_postponed_nodate'/);
  assert.match(скрипт, /kind: 'match_postponed_nodate'/);
  assert.match(скрипт, /body_template: '⏰ Матч перенесено · нову дату повідомимо'/);
});
