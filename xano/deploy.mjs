#!/usr/bin/env node
/**
 * Синхронізує xano/crm/*.xs у API-групу `crm` (id 6, api:6HPZ3cxp) воркспейсу DraftbitAFU.
 *
 *   node xano/deploy.mjs            — усі файли
 *   node xano/deploy.mjs seasons    — лише файли, у назві яких є «seasons»
 *   node xano/deploy.mjs --check    — нічого не пише, показує що змінилось би
 *
 * Правила (перевірено 2026-09-14):
 * - POST …/apigroup/6/api з Content-Type text/x-xanoscript створює ендпоінт РАЗОМ із логікою,
 *   і він одразу живий (без «ракети»);
 * - PUT …/api/{id} з тим самим типом оновлює логіку; PUT із JSON логіку ІГНОРУЄ.
 * - Ендпоінт ідентифікується парою (name, verb); name = шлях із першого рядка файла.
 *
 * Група Default (ADMIN АФУ) цим скриптом не чіпається ніколи: id групи зашитий.
 */
import fs from 'node:fs';
import path from 'node:path';
import { мета } from './meta.mjs';

const ГРУПА = 6;
const ДИР = path.join(path.dirname(new URL(import.meta.url).pathname), 'crm');
const args = process.argv.slice(2);
const перевірка = args.includes('--check');
const фільтр = args.find((a) => !a.startsWith('--'));

const заголовок = (xs) => {
  const m = xs.match(/^query\s+(?:"([^"]+)"|(\S+))\s+verb=(\w+)/m);
  if (!m) throw new Error('не знайдено рядок query … verb=');
  return { name: m[1] ?? m[2], verb: m[3].toUpperCase() };
};

const наявні = (await мета('GET', `/workspace/1/apigroup/${ГРУПА}/api?per_page=200`)).items;
const файли = fs.readdirSync(ДИР).filter((f) => f.endsWith('.xs') && (!фільтр || f.includes(фільтр))).sort();

let створено = 0, оновлено = 0, безЗмін = 0, помилок = 0;
for (const f of файли) {
  const xs = fs.readFileSync(path.join(ДИР, f), 'utf8');
  const { name, verb } = заголовок(xs);
  const є = наявні.find((a) => a.name === name && a.verb.toUpperCase() === verb);
  try {
    if (!є) {
      if (!перевірка) await мета('POST', `/workspace/1/apigroup/${ГРУПА}/api`, xs, 'text/x-xanoscript');
      console.log(`+ ${verb} ${name}  (${f})`);
      створено++;
      continue;
    }
    const жива = await мета('GET', `/workspace/1/apigroup/${ГРУПА}/api/${є.id}?include_xanoscript=true`);
    // Xano зберігає текст переформатованим (порожні рядки між секціями), тому
    // порівнюємо без порожніх рядків і без крайніх пробілів у рядках.
    const норм = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    if (норм(жива.xanoscript?.value ?? '') === норм(xs)) {
      безЗмін++;
      continue;
    }
    if (!перевірка) await мета('PUT', `/workspace/1/apigroup/${ГРУПА}/api/${є.id}`, xs, 'text/x-xanoscript');
    console.log(`~ ${verb} ${name}  #${є.id} (${f})`);
    оновлено++;
  } catch (e) {
    помилок++;
    console.error(`✗ ${verb} ${name}  (${f}) → ${e.message}`);
    if (e.дані) console.error('  ', JSON.stringify(e.дані).slice(0, 600));
  }
}
console.log(`\n${перевірка ? '[перевірка] ' : ''}створено ${створено}, оновлено ${оновлено}, без змін ${безЗмін}, помилок ${помилок}`);
if (помилок) process.exit(1);
