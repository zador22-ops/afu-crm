import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ЗМІННІ_ГРИ, ЗМІННІ_МАТЧУ, ПРИКЛАД_ГРИ, ПРИКЛАД_МАТЧУ, заповнити, змінніДля, невідоміЗмінні, чиГра } from './pushVars.js';

test('пуш гри — за префіксом kind game_', () => {
  assert.equal(чиГра('game_overtaken'), true);
  assert.equal(чиГра('game_nick_reset'), true);
  assert.equal(чиГра('goal'), false);
  assert.equal(чиГра('match_start'), false);
  assert.equal(чиГра(undefined), false);
});

test('у кожного набору є приклад на кожну змінну — інакше прев\'ю з дірою', () => {
  for (const [змінні, приклад] of [
    [ЗМІННІ_МАТЧУ, ПРИКЛАД_МАТЧУ],
    [ЗМІННІ_ГРИ, ПРИКЛАД_ГРИ],
  ]) {
    assert.deepEqual(Object.keys(приклад).sort(), Object.keys(змінні).sort());
  }
});

test('{score} означає різне: рахунок матчу і рекорд гри', () => {
  assert.equal(заповнити('Рахунок {score}', змінніДля('goal').приклад), 'Рахунок 1:5');
  assert.equal(заповнити('Ваш рекорд {score}', змінніДля('game_month_winner').приклад), 'Ваш рекорд 1840');
});

test('чернетки текстів гри з брифу — без невідомих змінних і з цілими реченнями', () => {
  const чернетки = {
    game_overtaken: ['Влуч у ворота: вас обігнали', '{nick} обійшов вас — ви тепер {place}-й у {month}. Відіграєтесь?'],
    game_month_end_soon: ['Влуч у ворота: 2 дні до фінішу місяця', 'Ви {place}-й, до {target_place}-го місця — {gap} очок'],
    game_month_result: ['Влуч у ворота: підсумок {month}', 'Ви {place}-й з {players}'],
    game_month_winner: ['Влуч у ворота: ви переможець {month}!', 'Ваш рекорд {score} — у таблиці сезону'],
    game_hall_of_fame: ['Влуч у ворота: ви в Залі слави!', 'Переможець сезону {season}'],
    game_nick_reset: ['Влуч у ворота: оберіть новий нікнейм', 'Ваш нік скинуто модератором'],
  };
  for (const [kind, тексти] of Object.entries(чернетки)) {
    assert.deepEqual(невідоміЗмінні(тексти, kind), [], kind);
    const { приклад } = змінніДля(kind);
    for (const т of тексти) assert.doesNotMatch(заповнити(т, приклад), /\{|\}|\s-й|\s\s/, `${kind}: ${т}`);
  }
  assert.equal(
    заповнити('{nick} обійшов вас — ви тепер {place}-й у {month}. Відіграєтесь?', ПРИКЛАД_ГРИ),
    'Голеадор обійшов вас — ви тепер 4-й у жовтні. Відіграєтесь?'
  );
});

test('змінні матчу в пуші гри (і навпаки) — невідомі, як і перевірить сервер', () => {
  assert.deepEqual(невідоміЗмінні(['{home} — {away}'], 'game_overtaken'), ['home', 'away']);
  assert.deepEqual(невідоміЗмінні(['{nick} забив'], 'goal'), ['nick']);
  assert.deepEqual(невідоміЗмінні(['{score}'], 'goal'), []);
  assert.deepEqual(невідоміЗмінні(['{score}'], 'game_month_winner'), []);
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
