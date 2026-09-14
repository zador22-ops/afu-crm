#!/usr/bin/env node
/**
 * Тонка обгортка над Metadata API Xano.
 *
 *   node apis/xano-meta.mjs GET  /workspace/1/table
 *   node apis/xano-meta.mjs POST /workspace/1/table/7/content/search '{"page":1}'
 *
 * Токен НЕ зберігається в репозиторії і не передається аргументом: він лежить
 * у Keychain macOS і читається щоразу заново. Покласти його туди:
 *
 *   security add-generic-password -a afu -s xano-metadata -w
 *
 * (без значення в кінці — Keychain спитає інтерактивно, тож токен не потрапить
 * ані в історію шелу, ані у файл на диску.)
 *
 * Скрипт навмисно ніде не друкує сам токен: при помилці показує лише код
 * відповіді. Якщо додаєте сюди логування — не логуйте заголовки.
 */
import { execFileSync } from 'node:child_process';

const БАЗА = 'https://xdeg-kg7i-jjtu.f2.xano.io/api:meta';
export const ВОРКСПЕЙС = 1; // DraftbitAFU

const ЯК_ПОКЛАСТИ =
  '  security add-generic-password -U -a afu -s xano-metadata -w "$(pbpaste)"';

const токен = () => {
  let значення;
  try {
    значення = execFileSync(
      'security',
      ['find-generic-password', '-a', 'afu', '-s', 'xano-metadata', '-w'],
      { encoding: 'utf8' }
    ).trim();
  } catch {
    throw new Error(`Токена немає в Keychain. Покласти:\n${ЯК_ПОКЛАСТИ}`);
  }
  // Інтерактивний `-w` без значення мовчки приймає порожню вставку, і далі
  // летить `Bearer ` з нічим — Xano відповідає «Invalid token», що виглядає
  // як проблема з токеном, а не з тим, що його немає. Ловимо тут.
  if (!значення) {
    throw new Error(
      `У Keychain лежить порожнє значення — токен не записався.\nПерезаписати:\n${ЯК_ПОКЛАСТИ}`
    );
  }
  return значення;
};

/**
 * @param тіло об'єкт (піде як JSON) або рядок; рядок вимагає `тип`
 * @param тип  content-type для рядкового тіла, напр. 'text/x-xanoscript'
 */
export const мета = async (метод, шлях, тіло, тип) => {
  const рядкове = typeof тіло === 'string';
  const contentType = рядкове ? тип || 'text/plain' : 'application/json';
  const res = await fetch(БАЗА + шлях, {
    method: метод,
    headers: {
      Authorization: `Bearer ${токен()}`,
      ...(тіло != null ? { 'Content-Type': contentType } : {}),
    },
    ...(тіло != null ? { body: рядкове ? тіло : JSON.stringify(тіло) } : {}),
  });
  const текст = await res.text();
  let дані;
  try {
    дані = JSON.parse(текст);
  } catch {
    дані = текст;
  }
  if (!res.ok) {
    const err = new Error(`${метод} ${шлях} → HTTP ${res.status}`);
    err.status = res.status;
    err.дані = дані;
    throw err;
  }
  return дані;
};

// Запуск із командного рядка
if (process.argv[1]?.endsWith('xano-meta.mjs')) {
  const [, , метод, шлях, тіло] = process.argv;
  if (!метод || !шлях) {
    console.error('Використання: node apis/xano-meta.mjs МЕТОД /шлях [json]');
    process.exit(2);
  }
  try {
    const дані = await мета(метод.toUpperCase(), шлях, тіло && JSON.parse(тіло));
    console.log(JSON.stringify(дані, null, 2));
  } catch (err) {
    console.error(err.message);
    if (err.дані) console.error(JSON.stringify(err.дані, null, 2));
    process.exit(1);
  }
}
