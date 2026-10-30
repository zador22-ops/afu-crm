import { test } from 'node:test';
import assert from 'node:assert/strict';
import { даніАкаунта, клубиДляВибору, маєПраво, помилкаАкаунтів } from './clubAccounts.js';

test('новий акаунт — усі поля, пошта й назва обрізані, клуби впорядковані', () => {
  assert.deepEqual(даніАкаунта({}, { email: ' Club@x.ua ', name: ' Сокіл ', password: 'секрет-123', active: true, обрані: new Set([21, 20]) }), {
    email: 'Club@x.ua',
    name: 'Сокіл',
    password: 'секрет-123',
    teaminfo_ids: [20, 21],
  });
});

test('наявний акаунт — лише змінене; порожній пароль не надсилається', () => {
  const item = { id: 1, name: 'Сокіл', is_active: true, clubs: [{ teaminfo_id: 20 }] };
  assert.deepEqual(даніАкаунта(item, { name: 'Сокіл', password: '', active: true, обрані: new Set([20]) }), {});
  assert.deepEqual(даніАкаунта(item, { name: 'ФК Сокіл', password: '', active: false, обрані: new Set([20]) }), { name: 'ФК Сокіл', is_active: false });
  assert.deepEqual(даніАкаунта(item, { name: 'Сокіл', password: 'новий-пароль', active: true, обрані: new Set([20, 21]) }), {
    password: 'новий-пароль',
    teaminfo_ids: [20, 21],
  });
});

test('вибір клубів: без суперників, обрані зверху й поза пошуком, архів у кінці', () => {
  const clubs = [
    { id: 1, TeamName: 'Яструб', Relevance: true },
    { id: 2, TeamName: 'Авангард', Relevance: false },
    { id: 3, TeamName: 'Бровари', Relevance: true },
    { id: 4, TeamName: 'Збірна Польщі', team_kind: 'national' },
  ];
  assert.deepEqual(клубиДляВибору(clubs, '', new Set()).map((c) => c.id), [3, 1, 2]);
  assert.deepEqual(клубиДляВибору(clubs, 'бров', new Set([2])).map((c) => c.id), [2, 3]);
  assert.deepEqual(клубиДляВибору(clubs, 'збір', new Set()).map((c) => c.id), []);
});

test('вкладка «Акаунти клубів» — лише з правом 22; 403 — зрозумілим текстом', () => {
  const ролі = { roles: [{ id: 1, access_rights_id: [1, 22] }, { id: 2, access_rights_id: [1] }, { id: 3 }] };
  assert.equal(маєПраво(ролі, 1, 22), true);
  assert.equal(маєПраво(ролі, 2, 22), false);
  assert.equal(маєПраво(ролі, 3, 22), false);
  assert.equal(маєПраво(undefined, 1, 22), false);
  assert.equal(помилкаАкаунтів({ status: 403, message: 'Access denied' }).message, 'Немає права «Акаунти клубів»');
  const інша = { status: 400, message: 'x' };
  assert.equal(помилкаАкаунтів(інша), інша);
  assert.equal(помилкаАкаунтів(undefined), null);
});
