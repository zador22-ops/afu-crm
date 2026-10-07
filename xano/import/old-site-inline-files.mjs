#!/usr/bin/env node
/**
 * Перенос зі старого сайту, етап 4: картинки й файли всередині тексту новин (body_html)
 * — у vault Xano, адреси в тексті переписуються, щоб ніщо не залежало від futsal.com.ua.
 *
 *   node xano/import/old-site-inline-files.mjs          — сухий прогін: скільки файлів і обсяг
 *   node xano/import/old-site-inline-files.mjs --write  — завантаження й заміна адрес
 *
 * Береться все з wp-content/uploads старого сайту (і його тестового двійника
 * wptest.initservices.com.ua) у src картинок і href посилань на файли. Посилання на
 * сторінки старого сайту (не файли) лише рахуються — їх куди вести, вирішує PM.
 * Кеш файлів спільний з етапами 1–3 (files-cache.json). Ідемпотентно: після заміни
 * у тексті старих адрес немає, повторний прогін нічого не робить.
 */
import fs from 'node:fs';
import { мета } from '../meta.mjs';

const XANO = 'https://xdeg-kg7i-jjtu.f2.xano.io';
const ЗАПИС = process.argv.includes('--write');
// --from=2026-08-01 — лише новини, опубліковані від цієї дати (за Києвом, 00:00)
const ВІД = (process.argv.find((a) => a.startsWith('--from=')) || '').split('=')[1];
const МЕЖА = ВІД ? Date.parse(`${ВІД}T00:00:00+03:00`) : 0;
const ФАЙЛ = /(https?:)?\/\/(www\.)?(futsal\.com\.ua|wptest\.initservices\.com\.ua)\/wp-content\/uploads\/[^"'\s)<>]+/gi;
const СТОРІНКА = /href="(https?:)?\/\/(www\.)?futsal\.com\.ua\/(?!wp-content)[^"]*"/gi;

const КЕШ = new URL('./files-cache.json', import.meta.url);
const кеш = fs.existsSync(КЕШ) ? JSON.parse(fs.readFileSync(КЕШ, 'utf8')) : {};
const норм = (u) => (u.startsWith('//') ? 'https:' + u : u.replace(/^http:/, 'https:')).replace('wptest.initservices.com.ua', 'futsal.com.ua');

async function* новини() {
  for (let p = 1; ; p++) {
    const r = await мета('POST', '/workspace/1/table/71/content/search', { page: p, per_page: 200 });
    yield r.items;
    if (!r.nextPage) return;
  }
}

const лік = { новин: 0, зФайлами: 0, посилань: 0, унікальних: 0, уКеші: 0, байтів: 0, недоступних: 0, сторінок: 0, оновлено: 0 };
const унікальні = new Map();
for await (const пачка of новини()) {
  for (const n of пачка) {
    if (МЕЖА && !(n.published_at >= МЕЖА)) continue;
    лік.новин++;
    const html = n.body_html || '';
    const знайдені = [...new Set((html.match(ФАЙЛ) || []))];
    лік.сторінок += (html.match(СТОРІНКА) || []).length;
    if (!знайдені.length) continue;
    лік.зФайлами++;
    лік.посилань += знайдені.length;
    for (const u of знайдені) if (!унікальні.has(норм(u))) унікальні.set(норм(u), null);
    if (!ЗАПИС) continue;
    let нове = html;
    for (const u of знайдені) {
      const src = норм(u);
      const f = await завантажити(src);
      if (f) нове = нове.split(u).join(f.url);
    }
    if (нове !== html) {
      await мета('PUT', `/workspace/1/table/71/content/${n.id}`, { body_html: нове, updated_at: Date.now() });
      лік.оновлено++;
      if (лік.оновлено % 25 === 0) console.log(`  … оновлено ${лік.оновлено} новин`);
    }
  }
}
лік.унікальних = унікальні.size;
лік.уКеші = [...унікальні.keys()].filter((u) => кеш[u]).length;

if (!ЗАПИС) {
  // Обсяг — HEAD на кожен файл, якого ще немає в кеші
  for (const u of унікальні.keys()) {
    if (кеш[u]) continue;
    try {
      const r = await fetch(u, { method: 'HEAD' });
      if (!r.ok) { лік.недоступних++; continue; }
      лік.байтів += Number(r.headers.get('content-length') || 0);
    } catch { лік.недоступних++; }
  }
}
console.log(`${ЗАПИС ? 'ЗАПИС' : '[сухий прогін]'}`, JSON.stringify({ ...лік, МБ: Math.round(лік.байтів / 1048576) }));

async function завантажити(src) {
  if (кеш[src]) return кеш[src];
  try {
    const res = await fetch(src);
    if (!res.ok) { лік.недоступних++; return null; }
    const mime = res.headers.get('content-type') || 'application/octet-stream';
    const blob = new Blob([await res.arrayBuffer()], { type: mime });
    const f = new FormData();
    f.append('content', blob, decodeURIComponent(src.split('/').pop().split('?')[0]));
    if (mime.startsWith('image/')) f.append('type', 'image');
    const r = await мета('POST', '/workspace/1/file', f);
    кеш[src] = { access: 'public', path: r.path, name: r.name, type: r.type, size: r.size, mime: r.mime, url: XANO + r.path };
    fs.writeFileSync(КЕШ, JSON.stringify(кеш, null, 1));
    return кеш[src];
  } catch (e) {
    лік.недоступних++;
    console.error(`  ✗ ${src}: ${e.message}`);
    return null;
  }
}
