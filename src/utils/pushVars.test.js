import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ЗМІННІ_ГРИ, ЗМІННІ_МАТЧУ, ПРИКЛАД_ГРИ, ПРИКЛАД_МАТЧУ, заповнити, змінніДля, невідоміЗмінні, чиГра } from './pushVars.js';

test('пуш гри — за префіксом kind game_', () => {
  assert.equal(чиГра('game_overtaken'), true);
  assert.equal(чиГра('game_nick_reset'), true);
  assert.equal(чиГра('goal'), false);
  assert.equal(чиГра('match_start'), false);
  assert.equal(чиГра(undefined), false);
});

test('у кожної змінної є приклад — інакше прев\'ю з дірою', () => {
  assert.deepEqual(Object.keys(ПРИКЛАД_МАТЧУ).sort(), Object.keys(ЗМІННІ_МАТЧУ).sort());
  const усіГри = new Set(Object.values(ЗМІННІ_ГРИ).flatMap((з) => Object.keys(з)));
  assert.deepEqual([...усіГри].sort(), Object.keys(ПРИКЛАД_ГРИ).sort());
});

test('списки змінних у CRM і на сервері (push-templates-id.patch.xs) однакові', () => {
  const xs = fs.readFileSync(new URL('../../xano/crm/push-templates-id.patch.xs', import.meta.url), 'utf8');
  const список = (рядок) => [...рядок.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
  const матч = xs.match(/const МАТЧ = \[([^\]]*)\]/)[1];
  assert.deepEqual(список(матч), Object.keys(ЗМІННІ_МАТЧУ).sort());
  const гра = Object.fromEntries([...xs.match(/const ГРА = \{([\s\S]*?)\};/)[1].matchAll(/(game_\w+): \[([^\]]*)\]/g)].map((m) => [m[1], список(m[2])]));
  assert.deepEqual(
    гра,
    Object.fromEntries(Object.entries(ЗМІННІ_ГРИ).map(([k, з]) => [k, Object.keys(з).sort()]))
  );
});

test('{score} означає різне: рахунок матчу і рекорд гри', () => {
  assert.equal(заповнити('Рахунок {score}', змінніДля('goal').приклад), 'Рахунок 1:5');
  assert.equal(заповнити('Ваш рекорд {score}', змінніДля('game_month_winner').приклад), 'Ваш рекорд 15779');
});

test('тексти гри від Backend (16.10) — без невідомих змінних і цілими реченнями', () => {
  const тексти = {
    game_overtaken: ['Влуч у ворота: вас обігнали', '{nick} обійшов вас — ви тепер {place}-й у {month_in}. Відіграєтесь?'],
    game_month_end_soon: ['Влуч у ворота: 2 дні до фінішу місяця', 'Ви {place}-й, до {target_place}-го місця — {gap} очок'],
    game_month_end_soon_leader: ['Влуч у ворота: 2 дні до фінішу місяця', 'Ви лідер! Перевага над 2-м місцем — {gap} очок'],
    game_month_result: ['Влуч у ворота: підсумок {month}', 'Ви {place}-й з {players}. Новий місяць — нова таблиця!'],
    game_month_winner: ['Влуч у ворота: ви переможець {month}!', 'Ваш рекорд {score} — у таблиці сезону'],
    game_hall_of_fame: ['Влуч у ворота: ви в Залі слави!', 'Переможець сезону {season}'],
    game_nick_reset: ['Влуч у ворота: оберіть новий нікнейм', 'Ваш нік скинуто модератором'],
  };
  assert.deepEqual(Object.keys(тексти).sort(), Object.keys(ЗМІННІ_ГРИ).sort());
  for (const [kind, тт] of Object.entries(тексти)) {
    assert.deepEqual(невідоміЗмінні(тт, kind), [], kind);
    const { приклад } = змінніДля(kind);
    for (const т of тт) assert.doesNotMatch(заповнити(т, приклад), /\{|\}|\s-й|\s\s/, `${kind}: ${т}`);
  }
  const п = змінніДля('game_overtaken').приклад;
  assert.equal(заповнити(тексти.game_overtaken[1], п), 'Їжак_7 обійшов вас — ви тепер 4-й у жовтні. Відіграєтесь?');
  assert.equal(заповнити(тексти.game_month_winner[0], п), 'Влуч у ворота: ви переможець жовтня!');
});

test('змінні — свої для кожного виду, як і на сервері', () => {
  assert.deepEqual(невідоміЗмінні(['{home} — {away}'], 'game_overtaken'), ['home', 'away']);
  assert.deepEqual(невідоміЗмінні(['{month}'], 'game_overtaken'), ['month']); // тут лише {month_in}
  assert.deepEqual(невідоміЗмінні(['{month_in}'], 'game_month_result'), ['month_in']);
  assert.deepEqual(невідоміЗмінні(['{nick}'], 'game_nick_reset'), ['nick']);
  assert.deepEqual(невідоміЗмінні(['{gap}'], 'game_month_end_soon_leader'), []);
  assert.deepEqual(невідоміЗмінні(['{place}'], 'game_new_kind'), ['place']); // невідомий вид гри — без змінних
  assert.deepEqual(невідоміЗмінні(['{nick} забив'], 'goal'), ['nick']);
  assert.deepEqual(невідоміЗмінні(['{score}'], 'goal'), []);
  assert.deepEqual(невідоміЗмінні(['порожня {}'], 'goal'), ['']);
});

test('заповнити: поведінка для матчів не змінилась при перенесенні', () => {
  assert.equal(заповнити('{home} — {away}, {minute} · {competition}'), 'Авалон — СкайАп, 7′ · Екстра-ліга');
  assert.equal(заповнити('Гол! {player} ({minute})', { player: 'Ліфер' }), 'Гол! Ліфер');
  // Так було й до перенесення: порожня змінна перед «·» забирає з собою і
  // пробіл. Прев'ю не виправляємо окремо від сервера — інакше покаже не те,
  // що прийде на телефон.
  assert.equal(заповнити('{home}, {team} · {tour}', { home: 'А', tour: '6-й тур' }), 'А· 6-й тур');
});
