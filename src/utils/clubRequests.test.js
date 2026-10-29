import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { назваЗаявки, підсумокПакета, статусЗаявки, зміниЗаявки } from './clubRequests.js';

const xs = fs.readFileSync(new URL('../../xano/crm/club-clubs-id-requests.get.xs', import.meta.url), 'utf8');
const кінець = xs.indexOf('} as $history');
const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
const історія = new Function('ЗМІННІ_', код.replace(/\$var\./g, 'ЗМІННІ_.'));

test('сервер: пакети з заявками, імена осіб (наявних і нових), турнір, перехід; «виведені переходом»', () => {
  const r = історія({
    batches: [{ id: 2, status: 'closed', acted_by_users_id: 46 }, { id: 1, status: 'withdrawn', acted_by_users_id: null }],
    rows: [
      { id: 10, batch_id: 2, entity: 'club', action: 'update', after: { TeamInfo: 'x' } },
      { id: 11, batch_id: 2, entity: 'person', action: 'create', after: { prizvushche: 'Новенко', Name: 'Петро' } },
      { id: 12, batch_id: 2, entity: 'squad_row', action: 'create', depends_on_id: 11, leagues_id: 10, after: { Number: 9 } },
      { id: 13, batch_id: 2, entity: 'squad_row', action: 'transfer', people_id: 7, leagues_id: 10, transfer_from_teaminfo_id: 3, after: { Number: 4 } },
    ],
    transfers_out: [{ id: 50, teaminfo_id: 3, people_id: 8, leagues_id: 10, applied_at: 5 }],
    people: [{ id: 7, prizvushche: 'Старенко', Name: 'Іван' }, { id: 8, prizvushche: 'Пішов', Name: 'Олег' }],
    teams: [{ id: 3, TeamName: 'Сокіл' }],
    leagues: [{ id: 10, League: 'Екстра-ліга' }],
  });
  assert.deepEqual(r.batches.map((b) => b.requests.length), [4, 0]);
  assert.deepEqual(r.batches.map((b) => b.by_afu), [true, false]);
  assert.equal('acted_by_users_id' in r.batches[0], false); // id співробітника АФУ клубу не віддаємо
  const [, нова, рядок, перехід] = r.batches[0].requests;
  assert.equal(нова.person_name, 'Новенко Петро');
  assert.equal(рядок.person_name, 'Новенко Петро');
  assert.equal(рядок.league_name, 'Екстра-ліга');
  assert.equal(перехід.person_name, 'Старенко Іван');
  assert.equal(перехід.transfer_from_name, 'Сокіл');
  assert.deepEqual(r.transfers_out, [{ id: 50, applied_at: 5, person_name: 'Пішов Олег', to_club: 'Сокіл', league_name: 'Екстра-ліга' }]);
  assert.doesNotMatch(xs, /"apply_error"/); // текст збою — лише для АФУ
});

test('назва заявки', () => {
  assert.equal(назваЗаявки({ entity: 'club' }), 'Картка клубу');
  assert.equal(назваЗаявки({ entity: 'person', action: 'create', person_name: 'Новенко Петро' }), 'Нова особа: Новенко Петро');
  assert.equal(назваЗаявки({ entity: 'squad_row', action: 'create', person_name: 'Новенко Петро', league_name: 'Екстра-ліга' }), 'Гравець Новенко Петро — новий у складі · Екстра-ліга');
  assert.equal(назваЗаявки({ entity: 'squad_row', action: 'transfer', person_name: 'Іван', transfer_from_name: 'Сокіл' }), 'Гравець Іван — перехід з «Сокіл»');
  assert.equal(назваЗаявки({ entity: 'staff_row', action: 'remove', person_name: 'Тренер' }), 'Штаб: Тренер — виведення зі штабу');
});

test('зміни: підписи, «було → стане», зображення окремо', () => {
  const з = зміниЗаявки({ before: { TeamInfo: 'Старе', TeamLogo: { url: 'u1' }, Captain: false }, after: { TeamInfo: 'Нове', TeamLogo: { url: 'u2', path: '/vault/x' }, Captain: true, website: null } });
  assert.deepEqual(з.map((x) => [x.label, x.було, x.стане]), [
    ['Про клуб', 'Старе', 'Нове'],
    ['Емблема', 'зображення', 'зображення'],
    ['Капітан', 'ні', 'так'],
    ['Сайт', '—', '—'],
  ]);
  assert.deepEqual(з[1].фото, { стане: 'u2', було: 'u1' });
});

test('статуси й підсумок пакета', () => {
  assert.equal(статусЗаявки('rejected').текст, 'повернуто');
  assert.equal(статусЗаявки('failed').тон, 'bad');
  assert.equal(підсумокПакета([{ status: 'applied' }, { status: 'applied' }, { status: 'rejected' }]), '3 заявки: 2 погоджено, 1 повернуто');
  assert.equal(підсумокПакета([{ status: 'submitted' }]), '1 заявка: 1 на погодженні');
  assert.equal(підсумокПакета([]), '0 заявок');
});
