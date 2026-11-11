import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { значенняФорми, тілоЧернетки, помилкиФорми, статусЧернетки, якБуде } from './clubDraft.js';

// Лямбда перевірки чернетки — саме та, що в xano/crm/club-clubs-id-draft.put.xs
const xs = fs.readFileSync(new URL('../../xano/crm/club-clubs-id-draft.put.xs', import.meta.url), 'utf8');
const кінець = xs.indexOf('} as $plan');
const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
const план = (after, club = {}, venues = [{ id: 1 }, { id: 2 }], club_comment) =>
  // Імена, яких точно немає в самій лямбді (там є змінна циклу v)
  new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'))({ club, venues }, { after, teaminfo_id: 58, club_comment });

const ЛОГО = { path: '/vault/x/logo.png', url: 'https://x/vault/x/logo.png' };

test('сервер: лишає в after лише змінене; ключ club:<id>', () => {
  const p = план({ TeamInfo: ' Про нас ', website: 'https://old.example', founded_year: '2010', TeamLogo: ЛОГО }, { TeamInfo: 'Старе', website: 'https://old.example', founded_year: 2010 });
  assert.equal(p.key, 'club:58');
  assert.deepEqual(p.after, { TeamInfo: 'Про нас', TeamLogo: ЛОГО });
  assert.equal(p.empty, false);
  assert.equal(план({ website: 'https://a.b' }, { website: 'https://a.b' }).empty, true);
});

test('сервер: поля лише АФУ й недопустимі значення — відмова', () => {
  assert.equal(план({ TeamName: 'Нова назва' }).fields_ok, false);
  assert.equal(план({ parent_teaminfo_id: 3 }).fields_ok, false);
  // TeamInfo — місто, до 60 знаків (у 68 клубів — до 18)
  assert.equal(план({ TeamInfo: 'а'.repeat(61) }).about_ok, false);
  assert.equal(план({ TeamInfo: 'а'.repeat(60) }).about_ok, true);
  assert.equal(план({ founded_year: '1700' }).year_ok, false);
  assert.equal(план({ founded_year: '2999' }).year_ok, false);
  assert.equal(план({ home_venues_id: 99 }).venue_ok, false);
  assert.equal(план({ instagram: 'instagram.com/x' }).urls_ok, false);
  assert.equal(план({ kit_color_primary: 'red' }).colors_ok, false);
  assert.equal(план({ contact_email: 'не пошта' }).email_ok, false);
  assert.equal(план({ TeamLogo: { path: 'https://evil/x.png' } }).images_ok, false);
  assert.equal(план(null).shape_ok, false);
  assert.equal(план(['x']).shape_ok, false);
});

test('сервер: очищення поля — null; фото прибрати не можна; пропозиція арени — лише текстом', () => {
  const p = план({ website: '', founded_year: '', home_venues_id: '', TeamLogo: null, venue_suggestion: ' СК «Новий» ' }, { website: 'https://a.b', founded_year: 2001, home_venues_id: 1, TeamLogo: ЛОГО });
  assert.deepEqual(p.after, { website: null, founded_year: null, home_venues_id: null, venue_suggestion: 'СК «Новий»' });
  assert.deepEqual(план({ home_venues_id: '2' }, { home_venues_id: 1 }).after, { home_venues_id: 2 });
});

test('форма: значення — чинна картка з поправками чернетки; тіло — уся форма', () => {
  const картка = { TeamInfo: 'Старе', founded_year: 2001, TeamLogo: ЛОГО, kit_color_primary: '#112233' };
  const в = значенняФорми(картка, { after: { TeamInfo: 'Нове', venue_suggestion: 'Арена Х' } });
  assert.equal(в.TeamInfo, 'Нове');
  assert.equal(в.founded_year, '2001');
  assert.equal(в.TeamLogo, ЛОГО);
  assert.equal(в.venue_suggestion, 'Арена Х');
  assert.equal(в.website, '');
  const тіло = тілоЧернетки({ ...в, website: ' https://site.ua ' });
  assert.equal(тіло.after.website, 'https://site.ua');
  assert.equal(тіло.after.TeamLogo, ЛОГО);
  assert.equal(тіло.after.venue_suggestion, 'Арена Х');
  assert.equal('TeamPhoto' in тіло.after, false); // немає фото — не надсилаємо
});

test('як буде після погодження й статус', () => {
  const r = якБуде({ TeamInfo: 'Старе', website: 'x' }, { after: { TeamInfo: 'Нове' } });
  assert.equal(r.картка.TeamInfo, 'Нове');
  assert.equal(r.картка.website, 'x');
  assert.deepEqual([...r.змінені], ['TeamInfo']);
  assert.equal(статусЧернетки(null), null);
  assert.equal(статусЧернетки({ status: 'draft' }).тон, 'draft');
  assert.equal(статусЧернетки({ status: 'submitted' }).тон, 'wait');
});

test('перевірка форми до відправлення — ті самі правила', () => {
  assert.deepEqual(помилкиФорми({ founded_year: '2010', website: 'https://a.b', kit_color_primary: '#aabbcc' }, 2026), []);
  assert.deepEqual(помилкиФорми({ founded_year: '1800', instagram: 'insta', facebook: 'fb', kit_color_secondary: 'синій', contact_email: 'x' }, 2026), [
    'Рік заснування — від 1850 до поточного',
    'Посилання на сайт і соцмережі мають починатися з https://',
    'Колір форми — у вигляді #1A2B3C',
    'Перевірте пошту контактної особи',
  ]);
});

test('сервер: коментар клубу до чернетки — до 1000 знаків', () => {
  assert.equal(план({ website: 'https://a.b' }, {}, undefined, 'к'.repeat(1000)).comment_ok, true);
  assert.equal(план({ website: 'https://a.b' }, {}, undefined, 'к'.repeat(1001)).comment_ok, false);
});

// «Про клуб» (бриф club-about-field, Андрій 11.11): TeamInfo.about до 2000 знаків, переноси рядків — як є
test('«Про клуб»: у білому списку чернетки, до 2000 знаків, переноси рядків зберігаються', () => {
  const текст = 'Клуб заснований у 2008 році.\n\nЧемпіон області.';
  const п = план({ about: `  ${текст}  ` }, { about: null });
  assert.equal(п.fields_ok, true);
  assert.equal(п.about_len_ok, true);
  assert.deepEqual(п.after, { about: текст });
  // 2000 — можна; 2001 — ні; межа 200 «звичайних» полів на about не діє
  assert.equal(план({ about: 'а'.repeat(2000) }).about_len_ok, true);
  assert.equal(план({ about: 'а'.repeat(2000) }).text_ok, true);
  assert.equal(план({ about: 'а'.repeat(2001) }).about_len_ok, false);
  // незмінене — не в after; очищення — null
  assert.deepEqual(план({ about: текст }, { about: текст }).after, {});
  assert.deepEqual(план({ about: '' }, { about: текст }).after, { about: null });
  assert.match(xs, /"TeamInfo", "about", "founded_year"/);
  assert.match(xs, /precondition \(\$plan\.about_len_ok\)/);
});

test('«Про клуб»: форма кабінету, перевірка до відправлення, «Погодження» — було / стане', async () => {
  const { ПОЛЯ_КАРТКИ, ПРО_КЛУБ_МАКС } = await import('./clubDraft.js');
  assert.equal(ПРО_КЛУБ_МАКС, 2000);
  assert.deepEqual(ПОЛЯ_КАРТКИ.find((п) => п.key === 'about'), { key: 'about', label: 'Про клуб', kind: 'textarea', max: 2000 });
  const в = значенняФорми({ about: 'Старий опис' }, { after: { about: 'Новий\nопис' } });
  assert.equal(в.about, 'Новий\nопис');
  assert.equal(тілоЧернетки(в).after.about, 'Новий\nопис');
  assert.deepEqual(помилкиФорми({ about: 'а'.repeat(2001) }, 2026), ['Про клуб — до 2000 знаків']);
  assert.deepEqual(помилкиФорми({ about: 'а'.repeat(2000) }, 2026), []);
  const { порівняння } = await import('./moderation.js');
  assert.deepEqual(порівняння({ entity: 'club', before: { about: 'Старий' }, after: { about: 'Новий\nопис' } }), [
    { key: 'about', label: 'Про клуб', kind: 'textarea', before: 'Старий', after: 'Новий\nопис' },
  ]);
});

test('«Про клуб» у CRM АФУ: PATCH приймає about з межею 2000; кабінет читає about', () => {
  const p = fs.readFileSync(new URL('../../xano/crm/clubs-id.patch.xs', import.meta.url), 'utf8');
  assert.match(p, /text about\? filters=trim/);
  const кін = p.indexOf('} as $about_len_ok');
  const к = p.slice(p.lastIndexOf('api.lambda {', кін), кін).match(/code = """([\s\S]*?)"""/)[1];
  const ok = (about) => new Function('ВХІД_', к.replace(/\$input\./g, 'ВХІД_.'))({ about });
  assert.equal(ok(undefined), true);
  assert.equal(ok('а'.repeat(2000)), true);
  assert.equal(ok('а'.repeat(2001)), false);
  assert.match(p, /precondition \(\$about_len_ok == true\)/);
  const g = fs.readFileSync(new URL('../../xano/crm/club-clubs-id.get.xs', import.meta.url), 'utf8');
  assert.match(g, /"TeamInfo", "about", "founded_year"/);
});
