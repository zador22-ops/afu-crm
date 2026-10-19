import { test } from 'node:test';
import assert from 'node:assert/strict';
import { джерелоЗбою, розділитиЖурнал, чиЗбій } from './pushLog.js';

const розсилка = (id, kind = 'goal') => ({ id, kind, mode: 'live', recipients: 120, title: 'Гол!', body: '…' });
const збій = (id, title = 'game_hourly') => ({ id, kind: 'game_error', mode: 'error', recipients: 0, title, body: 'Expo: 503' });

test('збій — за kind game_error або mode error', () => {
  assert.equal(чиЗбій(збій(1)), true);
  assert.equal(чиЗбій({ kind: 'game_overtaken', mode: 'error' }), true);
  assert.equal(чиЗбій(розсилка(1)), false);
  assert.equal(чиЗбій({ kind: 'game_overtaken', mode: 'test' }), false);
  assert.equal(чиЗбій({ kind: 'game_month_result', mode: 'dry' }), false); // «перевірка» — не збій
  assert.equal(чиЗбій(undefined), false);
});

test('журнал ділиться на збої й розсилки, порядок зберігається', () => {
  const { збої, розсилки } = розділитиЖурнал([розсилка(5), збій(4), розсилка(3, 'game_overtaken'), збій(2, 'game/finish'), розсилка(1)]);
  assert.deepEqual(збої.map((r) => r.id), [4, 2]);
  assert.deepEqual(розсилки.map((r) => r.id), [5, 3, 1]);
});

test('порожній чи відсутній журнал — дві порожні частини', () => {
  assert.deepEqual(розділитиЖурнал([]), { збої: [], розсилки: [] });
  assert.deepEqual(розділитиЖурнал(undefined), { збої: [], розсилки: [] });
});

test('джерело збою людською мовою', () => {
  assert.equal(джерелоЗбою('game_hourly'), 'щогодинна задача гри');
  assert.equal(джерелоЗбою('game/finish'), 'кінець партії');
  assert.equal(джерелоЗбою('game_new_source'), 'game_new_source');
  assert.equal(джерелоЗбою(''), '—');
});
