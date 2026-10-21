import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ПІДКАЗКИ_ПАУЗИ,
  ПОПЕРЕДЖЕННЯ,
  ПРИЧИНА_МІН,
  зПричиною,
  можнаВідновити,
  можнаПеренести,
  можнаПризупинити,
  потрібнаПричина,
  причинаГодиться,
} from './postpone.js';
import { невідоміЗмінні, заповнити } from './pushVars.js';

const xs = (шлях) => fs.readFileSync(new URL(`../../xano/${шлях}`, import.meta.url), 'utf8');

test('«Перенести матч» — для «Онлайн», «Зіграного» і «Призупинено»', () => {
  assert.equal(можнаПеренести(3), true);
  assert.equal(можнаПеренести(4), true);
  assert.equal(можнаПеренести(5), true);
  assert.equal(можнаПеренести('4'), true); // статус приходить і рядком
  assert.equal(можнаПеренести(1), false); // запланований переносять у картці розкладу
  assert.equal(можнаПеренести(2), false); // уже перенесений
  assert.equal(можнаПеренести(undefined), false);
});

test('«Призупинити» — лише онлайн; «Відновити» — лише призупинений', () => {
  assert.deepEqual([1, 2, 3, 4, 5].filter(можнаПризупинити), [3]);
  assert.deepEqual([1, 2, 3, 4, 5].filter(можнаВідновити), [5]);
  assert.deepEqual([1, 2, 3, 4, 5].filter(зПричиною), [2, 5]);
  assert.ok(ПІДКАЗКИ_ПАУЗИ.includes('Повітряна тривога'));
});

test('картка розкладу: причина лише при переході в «Перенесений»', () => {
  assert.equal(потрібнаПричина(1, 2), true);
  assert.equal(потрібнаПричина(1, '2'), true);
  assert.equal(потрібнаПричина(2, 2), false); // уже перенесений: лише нова дата
  assert.equal(потрібнаПричина(2, 1), false);
  assert.equal(потрібнаПричина(1, 1), false);
});

test('причина — щонайменше 3 символи без пробілів по краях', () => {
  assert.equal(причинаГодиться('Дощ'), true);
  assert.equal(причинаГодиться('  ab  '), false);
  assert.equal(причинаГодиться(''), false);
  assert.equal(причинаГодиться(undefined), false);
});

test('сервер вимагає те саме: статуси 3/4, причина ≥ 3, пуш за статусом', () => {
  const p = xs('crm/matches-id-postpone.post.xs');
  assert.match(p, /query "matches\/\{match_id\}\/postpone" verb=POST/);
  assert.match(p, /\$was\.match_status_id == 3 \|\| \$was\.match_status_id == 4 \|\| \$was\.match_status_id == 5/);
  assert.match(p, new RegExp(`причина\\.length >= ${ПРИЧИНА_МІН}`));
  assert.match(p, /match_status_id: 2, status_note: \$plan\.note/);
  assert.match(p, /"CRM table recalc"/);
  assert.match(p, /type_of_event: "status"/);
  // Події протоколу не видаляються: жодного db.del у ендпоінті
  assert.doesNotMatch(p, /db\.del/);
});

test('попередження — без статистики, лише таблиця (слово Андрія 19.10; те саме покаже ADMIN 2.0)', () => {
  assert.equal(
    ПОПЕРЕДЖЕННЯ,
    'Матч зникне з турнірної таблиці. Події протоколу залишаться, але в таблицю не йдуть, доки матч не зіграють.'
  );
});

test('пуш перенесеного після початку — без «тепер <минулий час>», шаблон є в скрипті', () => {
  const fn = xs('functions/push-v2-match-status.xs');
  const скрипт = xs('push-templates-add.mjs');
  assert.match(fn, /const попереду = Number\(c\.time\) > Date\.now\(\);/);
  assert.match(fn, /попереду \? 'тепер ' \+ коли\(c\.time\) : 'нову дату повідомимо'/);
  assert.match(fn, /kind === 'match_postponed' && !попереду \? 'match_postponed_nodate'/);
  assert.match(скрипт, /kind: 'match_postponed_nodate'/);
  assert.match(скрипт, /body_template: '⏰ Матч перенесено · нову дату повідомимо'/);
});

test('pause: лише з «Онлайн», причина ≥ 3 в status_note, таблицю не прибирає', () => {
  const p = xs('crm/matches-id-pause.post.xs');
  assert.match(p, /query "matches\/\{match_id\}\/pause" verb=POST/);
  assert.match(p, /id_access_rights: 2/);
  assert.match(p, /precondition \(\$was\.match_status_id == 3\)/);
  assert.match(p, new RegExp(`причина\\.length >= ${ПРИЧИНА_МІН}`));
  assert.match(p, /match_status_id: 5, status_note: \$plan\.note/);
  assert.match(p, /"CRM table recalc"/);
  assert.doesNotMatch(p, /db\.del/);
});

test('result: 5 — лише для вже призупиненого, причина стирається, з 5 у 3 — «відновлено»', () => {
  const r = xs('crm/matches-id-result.post.xs');
  assert.match(r, /\$input\.match_status_id != 5 \|\| \$was\.match_status_id == 5/);
  assert.match(r, /data = \{status_note: null\}/);
  assert.match(r, /\$was\.match_status_id == 5 && \$input\.match_status_id == 3[\s\S]*?type_of_event: "resumed"/);
});

test('PATCH: статус 3/4/5 не міняється, 1 → 2 з причиною, reason не пишеться в Match', () => {
  const p = xs('crm/matches-id.patch.xs');
  assert.match(p, /\$was\.match_status_id != 3 && \$was\.match_status_id != 4 && \$was\.match_status_id != 5/);
  assert.match(p, /const переносимо = у === 2 && до !== 2;/);
  assert.match(p, /\|unset:"match_id"\|unset:"reason"/);
});

test('пуші паузи й відновлення: тексти функції, шаблони, аудиторія, змінна {reason}', () => {
  const fn = xs('functions/push-v2-match-status.xs');
  assert.match(fn, /c\.status === 5\) \{ kind = 'match_paused'/);
  assert.match(fn, /ev === 'resumed'\) \{ kind = 'match_resumed'/);
  assert.match(fn, /reason: c\.note/);
  assert.match(xs('functions/push-v2-match-context.xs'), /"status_note"\]/);
  assert.match(xs('functions/push-v2-audience.xs'), /kind === 'match_paused' \|\| kind === 'match_resumed'/);
  const скрипт = xs('push-templates-add.mjs');
  const шаблони = [...скрипт.matchAll(/kind: '(\w+)'[\s\S]*?body_template: '([^']*)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(шаблони.map((ш) => ш[0]), ['match_paused', 'match_resumed', 'match_postponed_nodate']);
  for (const [kind, текст] of шаблони) assert.deepEqual(невідоміЗмінні([текст, '{home} — {away}'], kind), [], kind);
  assert.equal(заповнити(шаблони[0][1]), '⏸ Матч призупинено · Повітряна тривога');
});

test('новий матч — лише «Запланований»: POST matches не приймає 2', () => {
  const p = xs('crm/matches.post.xs');
  assert.match(p, /precondition \(\$input\.match_status_id == 1\) \{/);
  assert.doesNotMatch(p, /match_status_id == 2/);
});

test('result: рахунок руками — лише разом зі статусом 4 (технічний результат)', () => {
  const r = xs('crm/matches-id-result.post.xs');
  assert.match(r, /keys\.includes\('Result_team1'\) \|\| keys\.includes\('Result_team2'\)/);
  assert.match(r, /precondition \(!\$score_sent \|\| \$input\.match_status_id == 4\)/);
});
