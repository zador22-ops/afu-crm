import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { розібрати } from './venueMapParse.js';
import { ПОВІДОМЛЕННЯ, наКарті, підказкаДоЗбереження, статусАрени, статусЗСервера } from './venueMap.js';

// Приклади посилань — вигадані точки, формати як у Google Карт
const З_СОБАЧКОЮ = 'https://www.google.com/maps/place/Sport+Complex/@48.4321057,35.0449312,17z';
const З_3D4D = 'https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d48.4321057!4d35.0449312!16s';
const З_Q = 'https://maps.google.com/?q=50.4501,30.5234';
const КОРОТКЕ = 'https://maps.app.goo.gl/AbCdEf123';
const ПОШУК_КАРТ = 'https://www.google.com/maps/search/спорткомплекс+київ';
const З_ТЕЛЕФОНА = 'https://www.google.com/maps?q=%D0%A1%D0%9A+%D0%A2%D0%B5%D1%81%D1%82&ftid=0x0:0x1';

test('копія розбору дослівно збігається з чернеткою Backend (якщо репо AFU поруч)', (t) => {
  const оригінал = new URL('../../../AFU/docs/xano/drafts/arena-map/venue-map-parse.js', import.meta.url);
  if (!fs.existsSync(оригінал)) return t.skip('репо AFU не поруч');
  // Від «function розібрати(» до наступної функції чи кінця файла
  const тіло = (s) => {
    const від = s.indexOf('function розібрати(');
    const до = s.indexOf('\nfunction ', від + 1);
    return s.slice(від, до === -1 ? undefined : до).trim();
  };
  assert.equal(тіло(fs.readFileSync(new URL('./venueMapParse.js', import.meta.url), 'utf8')), тіло(fs.readFileSync(оригінал, 'utf8')));
});

test('розбір: види посилань, як на сервері', () => {
  assert.equal(розібрати(З_3D4D).kind, 'place');
  assert.equal(розібрати(З_3D4D).source, '3d4d');
  assert.equal(розібрати(З_Q).source, 'q');
  assert.equal(розібрати(З_СОБАЧКОЮ).source, 'at');
  assert.equal(розібрати(КОРОТКЕ).kind, 'short');
  assert.equal(розібрати(ПОШУК_КАРТ).kind, 'search');
  assert.equal(розібрати(З_ТЕЛЕФОНА).kind, 'no_coords');
  assert.equal(розібрати('https://www.google.com/search?q=%D0%A1%D0%9A').kind, 'search'); // звичайний пошук Google — як у мокапі
  assert.equal(розібрати('https://yandex.ua/maps/1').kind, 'not_google');
  assert.equal(розібрати('  ').kind, 'empty');
});

test('статус від сервера після збереження — його message', () => {
  const ok = статусЗСервера({ kind: 'place', lat: 50.438123, lng: 30.521235, message: 'Точку знайдено: 50.438123, 30.521235' });
  assert.deepEqual(ok, { тон: 'ok', текст: 'Точку знайдено: 50.438123, 30.521235', href: наКарті(50.438123, 30.521235) });
  assert.equal(статусЗСервера({ kind: 'no_coords', lat: null, lng: null, message: ПОВІДОМЛЕННЯ.no_coords }).тон, 'warn');
  assert.equal(статусЗСервера({ kind: 'unresolved', message: 'Коротке посилання не відкрилось — перевірте його' }).текст, ПОВІДОМЛЕННЯ.unresolved);
  assert.equal(статусЗСервера({ kind: 'empty' }).тон, 'none');
  assert.equal(статусЗСервера(null).текст, ПОВІДОМЛЕННЯ.empty);
});

test('статус у списку — за lat/lng, причина — тим самим розбором', () => {
  const ok = статусАрени({ map_url: КОРОТКЕ, lat: 48.432106, lng: 35.044931 });
  assert.equal(ok.тон, 'ok');
  assert.equal(ok.текст, 'Точку знайдено: 48.432106, 35.044931');
  assert.equal(статусАрени({ map_url: '', lat: null, lng: null }).текст, ПОВІДОМЛЕННЯ.empty);
  assert.equal(статусАрени({}).тон, 'none');
  assert.equal(статусАрени({ map_url: ПОШУК_КАРТ }).текст, ПОВІДОМЛЕННЯ.search);
  assert.equal(статусАрени({ map_url: З_ТЕЛЕФОНА }).текст, ПОВІДОМЛЕННЯ.no_coords);
  assert.equal(статусАрени({ map_url: 'https://yandex.ua/maps/1' }).текст, ПОВІДОМЛЕННЯ.not_google);
  assert.match(статусАрени({ map_url: КОРОТКЕ, lat: null, lng: null }).текст, /^Точку з посилання не знайдено\. У посиланні немає координат/);
  assert.equal(статусАрени({ map_url: КОРОТКЕ, lat: '48.4', lng: '35.0' }).тон, 'ok'); // decimal може прийти рядком
});

test('підказка до збереження', () => {
  assert.match(підказкаДоЗбереження(З_3D4D).текст, /^Точку знайдено: 48\.432106, 35\.044931\. Збережіть/);
  assert.equal(підказкаДоЗбереження(КОРОТКЕ).текст, 'Коротке посилання — точку знайде сервер після збереження');
  assert.equal(підказкаДоЗбереження(ПОШУК_КАРТ).тон, 'warn');
  assert.equal(підказкаДоЗбереження('').текст, ПОВІДОМЛЕННЯ.empty);
});
