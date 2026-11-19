import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ПОМИЛКА_TELEGRAM, посиланняTelegram } from './telegramLink.js';

const url = (t) => посиланняTelegram(t).url;

test('Telegram: порожнє — null', () => {
  for (const t of ['', '   ', null, undefined]) assert.deepEqual(посиланняTelegram(t), { ok: true, url: null, error: null });
});

test('Telegram: @name і t.me/name — повне посилання https://t.me/name', () => {
  assert.equal(url('@sarmaty_kherson'), 'https://t.me/sarmaty_kherson');
  assert.equal(url('  t.me/sarmaty_kherson  '), 'https://t.me/sarmaty_kherson');
  assert.equal(url('www.t.me/afu_futsal'), 'https://t.me/afu_futsal');
  assert.equal(url('telegram.me/afu_futsal'), 'https://t.me/afu_futsal');
  assert.equal(url('t.me/+AbCdEf123'), 'https://t.me/+AbCdEf123'); // запрошення в закритий канал
});

test('Telegram: повна адреса — як є; інший домен без схеми — з https://', () => {
  assert.equal(url('https://t.me/afu_futsal'), 'https://t.me/afu_futsal');
  assert.equal(url('http://t.me/afu_futsal'), 'http://t.me/afu_futsal');
  assert.equal(url('club.ua/telegram'), 'https://club.ua/telegram');
});

test('Telegram: не посилання — зрозуміла помилка поля', () => {
  for (const t of ['sarmaty', '@ab', '@імʼя з пробілом', 'https://localhost/x', 'не посилання', 'https://']) {
    const р = посиланняTelegram(t);
    assert.equal(р.ok, false, t);
    assert.equal(р.error, ПОМИЛКА_TELEGRAM);
    assert.equal(р.url, null);
  }
});
