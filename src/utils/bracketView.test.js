import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { розкластиСітку } from './bracketLayout.js';
import { рахунокМатчу, станПари, стадіїСітки } from './bracketView.js';

// Сітка в CRM має виглядати так само, як у застосунку (бриф crm-bracket-editor): розкладка — та сама функція
test('розкладка сітки — дослівно AFU utils/bracketLayout.js (якщо репо AFU поруч)', (t) => {
  const оригінал = new URL('../../../AFU/utils/bracketLayout.js', import.meta.url);
  if (!fs.existsSync(оригінал)) return t.skip('репо AFU не поруч');
  assert.equal(fs.readFileSync(new URL('./bracketLayout.js', import.meta.url), 'utf8'), fs.readFileSync(оригінал, 'utf8'));
});

test('етапи «сітка»: раунди групуються за етапом у порядку турів, інші етапи — поза сіткою', () => {
  const tours = [
    { id: 1, league_stage_id: 1, _stage: { stage_type: 'таблиця', stage_name: 'Регулярка' } },
    { id: 55, league_stage_id: 2, _stage: { stage_type: 'сітка', stage_name: 'Плей-оф' } },
    { id: 56, league_stage_id: 2, _stage: { stage_type: 'сітка', stage_name: 'Плей-оф' } },
    { id: 60, league_stage_id: 3, _stage: { stage_type: 'сітка', stage_name: '' } },
  ];
  assert.deepEqual(
    стадіїСітки(tours).map((с) => [с.id, с.назва, с.раунди.map((р) => р.id)]),
    [
      [2, 'Плей-оф', [55, 56]],
      [3, 'Плей-оф', [60]],
    ],
  );
  assert.deepEqual(стадіїСітки(undefined), []);
});

test('стан пари: матчів немає / не зіграний / частково / усе зіграно', () => {
  assert.equal(станПари({ teaminfo_id1: 1, teaminfo_id2: 2 }), 'матчу ще немає');
  assert.equal(станПари({ teaminfo_id1: 1, teaminfo_id2: null }), 'без матчу (бай)');
  assert.equal(станПари({ teaminfo_id1: 1, teaminfo_id2: 2, legs: [{ match_status_id: 1 }] }), 'матч призначено, не зіграний');
  assert.equal(станПари({ teaminfo_id1: 1, teaminfo_id2: 2, legs: [{ match_status_id: 4 }, { match_status_id: 1 }] }), 'зіграно 1 з 2');
  assert.equal(станПари({ teaminfo_id1: 1, teaminfo_id2: 2, legs: [{ match_status_id: 4 }, { match_status_id: 5 }] }), 'зіграно 1 з 2'); // призупинений — ще не зіграний
  assert.equal(станПари({ teaminfo_id1: 1, teaminfo_id2: 2, legs: [{ match_status_id: 4 }, { match_status_id: '4' }] }), null);
});

test('рахунок матчу пари — в орієнтації пари, серія пенальті окремо', () => {
  assert.equal(рахунокМатчу({ match_status_id: 4, score: [3, 1], penalty: null }), '3:1');
  assert.equal(рахунокМатчу({ match_status_id: 4, score: [2, 2], penalty: [4, 5] }), '2:2 (пен. 4:5)');
  assert.equal(рахунокМатчу({ match_status_id: 3, score: [1, 0] }), null);
});

test('дерево з живої відповіді Default (ЕЛ 2024/25): три колонки й «За 3 місце» — як у застосунку', () => {
  const пара = (id, tours_id, a, b, r1, r2) => ({ id, tours_id, teaminfo_id1: a, teaminfo_id2: b, result_team1: r1, result_team2: r2, kind: 'series', _teaminfo1: { TeamName: `К${a}` }, _teaminfo2: { TeamName: `К${b}` } });
  const р = розкластиСітку({
    tours: [{ id: 55, TourName: '1/4' }, { id: 56, TourName: '1/2' }, { id: 57, TourName: 'Фінал' }, { id: 58, TourName: 'За 3 місце' }],
    bracket: [
      пара(1, 55, 1, 2, 3, 0), пара(2, 55, 3, 4, 3, 1), пара(3, 55, 5, 6, 3, 2), пара(4, 55, 7, 8, 3, 0),
      пара(5, 56, 1, 3, 3, 1), пара(6, 56, 5, 7, 3, 2),
      пара(7, 57, 1, 5, 3, 1),
      пара(8, 58, 3, 7, 3, 0),
    ],
  });
  assert.deepEqual(р.колонки.map((к) => [к.назва, к.пари.map((п) => п?.id ?? null)]), [['1/4', [1, 2, 3, 4]], ['1/2', [5, 6]], ['Фінал', [7]]]);
  assert.equal(р.заТретє.пара.id, 8);
});

test('пересування: місце цілі й крок — у серверному порядку туру; порядок вирішує лише без зведеного наступного раунду', async () => {
  const { місцеНаКрок, місцеЦілі, порядокВирішує } = await import('./bracketView.js');
  const пари = [{ id: 7, tours_id: 1 }, { id: 3, tours_id: 1 }, { id: 9, tours_id: 2 }, { id: 5, tours_id: 1 }];
  assert.equal(місцеЦілі(пари, { id: 3, tours_id: 1 }), 2);
  assert.equal(місцеЦілі(пари, { id: 5, tours_id: 1 }), 3);
  assert.equal(місцеЦілі(пари, { id: 9, tours_id: 2 }), 1);
  assert.equal(місцеЦілі(пари, { id: 4, tours_id: 1 }), null);
  assert.equal(місцеНаКрок(пари, { id: 7, tours_id: 1 }, -1), null);
  assert.equal(місцеНаКрок(пари, { id: 7, tours_id: 1 }, 1), 2);
  assert.equal(місцеНаКрок(пари, { id: 5, tours_id: 1 }, -1), 2);
  assert.equal(місцеНаКрок(пари, { id: 5, tours_id: 1 }, 1), null);
  const колонки = [{ пари: [{ id: 1 }, { id: 2 }] }, { пари: [null] }, { пари: [{ id: 3 }] }];
  assert.equal(порядокВирішує(колонки, 0), true); // наступний раунд порожній
  assert.equal(порядокВирішує(колонки, 1), false); // фінал уже є
  assert.equal(порядокВирішує(колонки, 2), true); // остання колонка
});

test('сервер: GET сітки — за position, далі id; нова пара — останньою в раунді', () => {
  const g = fs.readFileSync(new URL('../../xano/crm/tournaments-id-bracket.get.xs', import.meta.url), 'utf8');
  assert.match(g, /sort = \{Bracket\.tours_id: "asc", Bracket\.position: "asc", Bracket\.id: "asc"\}/);
  const p = fs.readFileSync(new URL('../../xano/crm/tournaments-id-bracket.post.xs', import.meta.url), 'utf8');
  assert.match(p, /return Number\(\$var\.round_count \|\| 0\) \+ 1;/);
  assert.match(p, /position\s*: \$next_position/);
});

test('«Третій попередній етап» без пар — звичайна колонка, не «За 3 місце» (Кубок 2026/27, Android 481c78d)', () => {
  const р = розкластиСітку({
    tours: [{ id: 150, TourName: 'Перший попередній етап' }, { id: 151, TourName: 'Другий попередній етап' }, { id: 156, TourName: 'Третій попередній етап' }],
    bracket: [{ id: 18, tours_id: 150, teaminfo_id1: 1, teaminfo_id2: 2 }],
  });
  assert.equal(р.заТретє, null);
  assert.deepEqual(р.колонки.map((к) => к.назва), ['Перший попередній етап', 'Другий попередній етап', 'Третій попередній етап']);
  // справжній матч за третє без пар — як і раніше, окремим блоком
  assert.equal(розкластиСітку({ tours: [{ id: 1, TourName: 'Фінал' }, { id: 2, TourName: 'За 3 місце' }], bracket: [] }).заТретє?.id, 2);
});

test('бай: пара з однією командою — тіла POST/PATCH і «є суперник» (бриф bracket-bye)', async () => {
  const { БЕЗ_СУПЕРНИКА, єСуперник, тілоЗмінПари, тілоНовоїПари } = await import('./bracketView.js');
  assert.equal(БЕЗ_СУПЕРНИКА, 'Очікує суперника');
  assert.equal(єСуперник({ teaminfo_id1: 3, teaminfo_id2: 5 }), true);
  for (const порожньо of [null, 0, undefined, '']) {
    assert.equal(єСуперник({ teaminfo_id1: 3, teaminfo_id2: порожньо }), false);
    assert.equal(єСуперник({ teaminfo_id1: порожньо, teaminfo_id2: 5 }), false);
  }
  // POST: без суперника — ключа teaminfo_id2 немає
  assert.deepEqual(тілоНовоїПари({ tours_id: '150', teaminfo_id1: '7', teaminfo_id2: '' }), { tours_id: 150, teaminfo_id1: 7 });
  assert.deepEqual(тілоНовоїПари({ tours_id: '150', teaminfo_id1: '7', teaminfo_id2: '9' }), { tours_id: 150, teaminfo_id1: 7, teaminfo_id2: 9 });
  // PATCH: прибрати наявного суперника — явне очищення; не було — нічого; новий — його id
  assert.deepEqual(тілоЗмінПари({ teaminfo_id2: 9 }, { teaminfo_id1: '7', teaminfo_id2: '' }), { teaminfo_id1: 7, clear_teaminfo_id2: true });
  assert.deepEqual(тілоЗмінПари({ teaminfo_id2: null }, { teaminfo_id1: '7', teaminfo_id2: '' }), { teaminfo_id1: 7 });
  assert.deepEqual(тілоЗмінПари({ teaminfo_id2: null }, { teaminfo_id1: '7', teaminfo_id2: '12' }), { teaminfo_id1: 7, teaminfo_id2: 12 });
});

test('бай у дереві: пара без суперника стає у слот і не ламає розкладку', () => {
  const р = розкластиСітку({
    tours: [{ id: 150, TourName: 'Перший' }, { id: 151, TourName: 'Другий' }],
    bracket: [
      { id: 1, tours_id: 150, teaminfo_id1: 1, teaminfo_id2: 2 },
      { id: 2, tours_id: 151, teaminfo_id1: 3, teaminfo_id2: null, _teaminfo1: { TeamName: 'Сармати' }, _teaminfo2: null },
    ],
  });
  // другий раунд: одна пара-бай; перший: два слоти, пара 1 — в одному з них
  assert.deepEqual(р.колонки[1].пари.map((п) => п?.id), [2]);
  assert.equal(р.колонки[0].пари.length, 2);
  assert.deepEqual(р.колонки[0].пари.filter(Boolean).map((п) => п.id), [1]);
});

test('бай з боку команди 1 — симетрично (бриф bracket-bye-team1)', async () => {
  const { назваКоманди, обидвіПорожні, тілоЗмінПари, тілоНовоїПари } = await import('./bracketView.js');
  // POST: порожньої команди немає в тілі з будь-якого боку
  assert.deepEqual(тілоНовоїПари({ tours_id: '151', teaminfo_id1: '', teaminfo_id2: '9' }), { tours_id: 151, teaminfo_id2: 9 });
  // PATCH: прибрати першу — clear_teaminfo_id1; друга не змінена й не надсилається, якщо порожня й не була
  assert.deepEqual(тілоЗмінПари({ teaminfo_id1: 7, teaminfo_id2: 9 }, { teaminfo_id1: '', teaminfo_id2: '9' }), { clear_teaminfo_id1: true, teaminfo_id2: 9 });
  assert.deepEqual(тілоЗмінПари({ teaminfo_id1: null, teaminfo_id2: 9 }, { teaminfo_id1: '', teaminfo_id2: '9' }), { teaminfo_id2: 9 });
  assert.deepEqual(тілоЗмінПари({ teaminfo_id1: null, teaminfo_id2: 9 }, { teaminfo_id1: '4', teaminfo_id2: '9' }), { teaminfo_id1: 4, teaminfo_id2: 9 });
  // обидві порожні — форма не відправляє
  assert.equal(обидвіПорожні({ teaminfo_id1: '', teaminfo_id2: '' }), true);
  assert.equal(обидвіПорожні({ teaminfo_id1: '0', teaminfo_id2: null }), true);
  assert.equal(обидвіПорожні({ teaminfo_id1: '', teaminfo_id2: '9' }), false);
  // назви: порожній бік — «Очікує суперника», з будь-якого боку
  assert.equal(назваКоманди({ teaminfo_id1: null, teaminfo_id2: 9, _teaminfo2: { TeamName: 'Ютландія' } }, 1), 'Очікує суперника');
  assert.equal(назваКоманди({ teaminfo_id1: null, teaminfo_id2: 9, _teaminfo2: { TeamName: 'Ютландія' } }, 2), 'Ютландія');
  // стан: бай з будь-якого боку
  const { станПари } = await import('./bracketView.js');
  assert.equal(станПари({ teaminfo_id1: null, teaminfo_id2: 9 }), 'без матчу (бай)');
});

test('нова пара в натиснуту клітинку: позиція, з якою розкладка ставить її саме туди (бриф bracket-slot-position)', async () => {
  const { позиціяДляСлоту } = await import('./bracketView.js');
  const п = (id, tours_id, a, b) => ({ id, tours_id, teaminfo_id1: a, teaminfo_id2: b });
  // Раунд 2 зведено: A (1–2), бай (3), C (5–6) → у раунді 1 клітинки 0,1 — під A, 4 — під C, вільні 2, 3, 5
  const дані = {
    tours: [{ id: 150, TourName: 'Перший' }, { id: 151, TourName: 'Другий' }],
    bracket: [
      п(1, 150, 1, 9), п(2, 150, 2, 10), п(3, 150, 5, 11),
      п(5, 150, 22, 23), // вільна пара, створена раніше
      п(4, 150, 20, 21), // нова — сервер поставив останньою
      п(10, 151, 1, 2), п(11, 151, 3, null), п(12, 151, 5, 6),
    ],
  };
  const де = (позиція) => {
    const тур = дані.bracket.filter((x) => x.tours_id === 150 && x.id !== 4);
    тур.splice(позиція - 1, 0, дані.bracket.find((x) => x.id === 4));
    let і = 0;
    const bracket = дані.bracket.map((x) => (x.tours_id === 150 ? тур[і++] : x));
    return розкластиСітку({ tours: дані.tours, bracket }).колонки[0].пари.findIndex((x) => x?.id === 4);
  };
  // зараз нова пара (остання) — у клітинці 3; клік по клітинці 2 — треба переставити перед вільною парою 5
  assert.equal(де(5), 3);
  const позиціяДля2 = позиціяДляСлоту(дані, розкластиСітку, 4, 150, 2);
  assert.ok(позиціяДля2 && позиціяДля2 < 5);
  assert.equal(де(позиціяДля2), 2);
  // клік по клітинці 3 — нова й так там: позиція = поточна
  assert.equal(де(позиціяДляСлоту(дані, розкластиСітку, 4, 150, 3)), 3);
  // клітинка 5 недосяжна: вільних пар лише дві, вони займають 2 і 3
  assert.equal(позиціяДляСлоту(дані, розкластиСітку, 4, 150, 5), null);
  // клітинка під привʼязаною парою (0) — недосяжна для нової пари з іншими командами
  assert.equal(позиціяДляСлоту(дані, розкластиСітку, 4, 150, 0), null);
  assert.equal(позиціяДляСлоту(дані, розкластиСітку, 999, 150, 2), null);
});
