import { test } from 'node:test';
import assert from 'node:assert/strict';
import { координатиЗ, видПосилання, наКарті, підказкаДоЗбереження, статусАрени } from './venueMap.js';

// Приклади посилань — вигадані точки, формати як у Google Карт
const З_СОБАЧКОЮ = 'https://www.google.com/maps/place/Sport+Complex/@48.4321057,35.0449312,17z/data=!3m1!4b1';
const З_3D4D = 'https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d48.4321057!4d35.0449312!16s';
const З_Q = 'https://maps.google.com/?q=50.4501,30.5234';
const КОРОТКЕ = 'https://maps.app.goo.gl/AbCdEf123';
const ПОШУК = 'https://www.google.com/search?q=%D0%A1%D0%9A+%D0%9C%D0%B5%D1%80%D0%B8%D0%B4%D1%96%D0%B0%D0%BD';
const ПОШУК_КАРТ = 'https://www.google.com/maps/search/спорткомплекс+київ';

test('координати з трьох видів повного посилання', () => {
  assert.deepEqual(координатиЗ(З_СОБАЧКОЮ), { lat: 48.4321057, lng: 35.0449312 });
  assert.deepEqual(координатиЗ(З_3D4D), { lat: 48.4321057, lng: 35.0449312 });
  assert.deepEqual(координатиЗ(З_Q), { lat: 50.4501, lng: 30.5234 });
  assert.deepEqual(координатиЗ('https://www.google.com/maps?q=-33.8,151.2'), { lat: -33.8, lng: 151.2 });
  assert.equal(координатиЗ(КОРОТКЕ), null);
  assert.equal(координатиЗ('https://www.google.com/maps/@95.1,30.5,10z'), null); // поза межами
});

test('вид посилання', () => {
  assert.equal(видПосилання(''), '');
  assert.equal(видПосилання('   '), '');
  assert.equal(видПосилання(З_СОБАЧКОЮ), 'coords');
  assert.equal(видПосилання(З_3D4D), 'coords');
  assert.equal(видПосилання(З_Q), 'coords');
  assert.equal(видПосилання(КОРОТКЕ), 'short');
  assert.equal(видПосилання('https://goo.gl/maps/xyz'), 'short');
  assert.equal(видПосилання(ПОШУК), 'search');
  assert.equal(видПосилання(ПОШУК_КАРТ), 'search');
  assert.equal(видПосилання('https://www.google.com/maps/place/Sport+Complex'), 'place');
  assert.equal(видПосилання('https://www.google.com.ua/maps/@50.45,30.52,15z'), 'coords');
  assert.equal(видПосилання('https://yandex.ua/maps/123'), 'other');
  assert.equal(видПосилання('просто текст'), 'other');
});

test('статус збереженої арени — за lat/lng від сервера', () => {
  const ok = статусАрени({ map_url: КОРОТКЕ, lat: 48.4321057, lng: 35.0449312 });
  assert.equal(ok.тон, 'ok');
  assert.equal(ok.текст, 'Точку знайдено: 48.4321, 35.0449');
  assert.equal(ok.href, наКарті(48.4321057, 35.0449312));
  assert.deepEqual(статусАрени({ map_url: '', lat: null, lng: null }), { тон: 'none', текст: 'Без посилання — застосунок шукатиме за назвою' });
  assert.equal(статусАрени({}).тон, 'none');
  assert.match(статусАрени({ map_url: ПОШУК, lat: null, lng: null }).текст, /^Це посилання на пошук/);
  const не = статусАрени({ map_url: КОРОТКЕ, lat: null, lng: null });
  assert.equal(не.тон, 'warn');
  assert.match(не.текст, /^Точку з посилання не знайдено/);
  assert.equal(статусАрени({ map_url: КОРОТКЕ, lat: 0, lng: 0 }).тон, 'ok'); // нуль — теж координата
});

test('підказка до збереження', () => {
  assert.equal(підказкаДоЗбереження('').тон, 'none');
  assert.equal(підказкаДоЗбереження(З_СОБАЧКОЮ).тон, 'ok');
  assert.match(підказкаДоЗбереження(КОРОТКЕ).текст, /сервер після збереження/);
  assert.equal(підказкаДоЗбереження(ПОШУК).тон, 'warn');
  assert.equal(підказкаДоЗбереження('https://yandex.ua/maps/1').тон, 'warn');
});
