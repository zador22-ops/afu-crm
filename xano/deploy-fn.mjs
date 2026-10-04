#!/usr/bin/env node
/**
 * Синхронізує функції (xano/functions/*.xs) і задачі за розкладом (xano/tasks/*.xs)
 * воркспейсу DraftbitAFU.
 *
 *   node xano/deploy-fn.mjs                 — усе
 *   node xano/deploy-fn.mjs "Push v2 news"  — лише файли, у назві яких є рядок
 *   node xano/deploy-fn.mjs --check         — нічого не пише
 *
 * Запобіжник: чіпає лише функції з назвою «Push v2 …» і задачі «push_…» (R55).
 * Чинні PushNotifications* (#6–#8), «Check access rights», «CRM table recalc»
 * і задачі notificationsScheduleMatchReminder / once_a_4week цим скриптом не
 * змінюються ніколи — навіть якщо файл із такою назвою з'явиться.
 */
import fs from 'node:fs';
import path from 'node:path';
import { мета } from './meta.mjs';

const КОРІНЬ = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const перевірка = args.includes('--check');
const фільтр = args.find((a) => !a.startsWith('--'));

const ВИДИ = [
  { dir: 'functions', api: 'function', re: /^function\s+(?:"([^"]+)"|(\S+))\s*\{/m, дозволено: (n) => n.startsWith('Push v2 ') },
  { dir: 'tasks', api: 'task', re: /^task\s+(?:"([^"]+)"|(\S+))\s*\{/m, дозволено: (n) => n.startsWith('push_') },
];

let створено = 0, оновлено = 0, безЗмін = 0, помилок = 0;
const норм = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

for (const вид of ВИДИ) {
  const дир = path.join(КОРІНЬ, вид.dir);
  if (!fs.existsSync(дир)) continue;
  const наявні = (await мета('GET', `/workspace/1/${вид.api}?per_page=200`)).items;
  const файли = fs.readdirSync(дир).filter((f) => f.endsWith('.xs') && (!фільтр || f.includes(фільтр))).sort();
  for (const f of файли) {
    const xs = fs.readFileSync(path.join(дир, f), 'utf8');
    const m = xs.match(вид.re);
    if (!m) { console.error(`✗ ${f}: немає рядка ${вид.api} …`); помилок++; continue; }
    const name = m[1] ?? m[2];
    if (!вид.дозволено(name)) { console.error(`✗ ${f}: «${name}» поза дозволеними назвами — пропущено`); помилок++; continue; }
    const є = наявні.find((a) => a.name === name);
    try {
      if (!є) {
        if (!перевірка) await мета('POST', `/workspace/1/${вид.api}`, xs, 'text/x-xanoscript');
        console.log(`+ ${вид.api} ${name}  (${f})`);
        створено++;
        continue;
      }
      const жива = await мета('GET', `/workspace/1/${вид.api}/${є.id}?include_xanoscript=true`);
      if (норм(жива.xanoscript?.value ?? '') === норм(xs)) { безЗмін++; continue; }
      if (!перевірка) await мета('PUT', `/workspace/1/${вид.api}/${є.id}`, xs, 'text/x-xanoscript');
      console.log(`~ ${вид.api} ${name}  #${є.id} (${f})`);
      оновлено++;
    } catch (e) {
      помилок++;
      console.error(`✗ ${вид.api} ${name}  (${f}) → ${e.message}`);
      if (e.дані) console.error('  ', JSON.stringify(e.дані).slice(0, 800));
    }
  }
}
console.log(`\n${перевірка ? '[перевірка] ' : ''}створено ${створено}, оновлено ${оновлено}, без змін ${безЗмін}, помилок ${помилок}`);
if (помилок) process.exit(1);
