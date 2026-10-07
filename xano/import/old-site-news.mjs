#!/usr/bin/env node
/**
 * Перенос новин зі старого сайту futsal.com.ua (WordPress) у news / news_category.
 * Бриф: afu-futzal docs/reports/perenos-staroho-saitu-2026-10-07.md, етапи 2–3.
 *
 *   node xano/import/old-site-news.mjs --after=2025-07-01             — сухий прогін
 *   node xano/import/old-site-news.mjs --after=2025-07-01 --write     — запис
 *   node xano/import/old-site-news.mjs --before=2025-07-01 --write    — архів (етап 3)
 *
 * Від найновіших пачками по 50. Ідемпотентно: новина з тим самим source_url або slug
 * пропускається. Текст чиститься тим самим набором тегів, що й редактор CRM
 * (src/utils/cleanHtml.js). Обкладинка й мініатюра — у vault; картинки всередині
 * тексту поки лишаються за старими адресами (бриф, п. 3). Автора не переносимо.
 */
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { мета } from '../meta.mjs';

const WP = 'https://futsal.com.ua/wp-json/wp/v2';
const XANO = 'https://xdeg-kg7i-jjtu.f2.xano.io';
const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const ЗАПИС = process.argv.includes('--write');
const ПІСЛЯ = arg('after');
const ДО = arg('before');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);
const ТЕГИ = ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li', 'blockquote', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col', 'iframe', 'div'];
const АТРИБУТИ = ['href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan',
  'allowfullscreen', 'frameborder', 'allow', 'data-youtube-video'];
const YOUTUBE = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//i;
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'iframe' && !YOUTUBE.test(node.getAttribute('src') || '')) node.parentNode?.removeChild(node);
});
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
    if (/^https?:/i.test(node.getAttribute('href') || '')) node.setAttribute('target', '_blank');
  }
});
const чисто = (html) =>
  DOMPurify.sanitize(html || '', { ALLOWED_TAGS: ТЕГИ, ALLOWED_ATTR: АТРИБУТИ, ADD_TAGS: ['iframe'], ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i })
    .replace(/<p>(\s|&nbsp;| )*<\/p>/g, '')
    .trim();
const текст = (html) => {
  const d = window.document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toWellFormed();
};
// Обрізка за символами, а не UTF-16 одиницями: інакше емодзі ріжеться навпіл і Xano не приймає JSON
const обрізати = (t, n) => Array.from(t).slice(0, n).join('');

// Рубрики: як на старому сайті, сезонні «Перша ліга 2022/23» і «2023/24» — у наявну «Перша ліга»
const РУБРИКИ = [
  ['afu', 'АФУ'], ['ekstra-liha', 'Екстра-ліга'], ['persha-liha', 'Перша ліга'], ['druha-liha', 'Друга ліга'],
  ['kubok-ukrainy', 'Кубок України'], ['zbirni', 'Збірні'], ['zbirni-cholovicha', 'Збірні (Чоловіча)'],
  ['zbirni-zhinocha', 'Збірні (Жіноча)'], ['zbirni-iunatska', 'Збірні (Юнацька)'], ['zhinky-vyshcha-liha', 'Жінки (Вища ліга)'],
  ['zhinky-kubok-ukrainy', 'Жінки (Кубок України)'], ['dity', 'Діти'], ['veterany', 'Ветерани'], ['amatory', 'Аматори'],
];
const WP_ДО_НАШОЇ = { 356: 'persha-liha', 492: 'persha-liha' };
const ЗАГАЛЬНІ = new Set([1, 129]); // «АФУ» і «Збірні» — батьківські, беремо конкретнішу, якщо є

const wpКат = await (await fetch(`${WP}/categories?per_page=100&_fields=id,slug`)).json();
const slugWP = Object.fromEntries(wpКат.map((c) => [c.id, WP_ДО_НАШОЇ[c.id] || c.slug]));
const рубрикаПоста = (ids) => {
  const конкретні = ids.filter((i) => !ЗАГАЛЬНІ.has(i));
  const id = конкретні[0] ?? (ids.includes(129) ? 129 : ids[0] ?? 1);
  return slugWP[id] || 'afu';
};

async function* пости() {
  for (let p = 1; ; p++) {
    const q = new URLSearchParams({ per_page: '50', page: String(p), orderby: 'date', order: 'desc', _embed: 'wp:featuredmedia' });
    if (ПІСЛЯ) q.set('after', `${ПІСЛЯ}T00:00:00`);
    if (ДО) q.set('before', `${ДО}T00:00:00`);
    const r = await fetch(`${WP}/posts?${q}`);
    if (!r.ok) return;
    yield { сторінка: p, усього: Number(r.headers.get('x-wp-totalpages')), пачка: await r.json() };
    if (p >= Number(r.headers.get('x-wp-totalpages'))) return;
  }
}

const КЕШ = new URL('./files-cache.json', import.meta.url);
const кеш = fs.existsSync(КЕШ) ? JSON.parse(fs.readFileSync(КЕШ, 'utf8')) : {};
const файл = async (src, meta) => {
  if (!src) return null;
  if (!кеш[src]) {
    const res = await fetch(src);
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    const blob = new Blob([await res.arrayBuffer()], { type: mime });
    // Xano відкидає файли з незвичним розширенням — ім'я з розширенням за типом
    const РОЗШ = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    let імя = decodeURIComponent(src.split('/').pop().split('?')[0]).replace(/[^\w.\-]+/g, '-');
    if (!/\.(jpe?g|png|webp|gif)$/i.test(імя)) імя = імя.replace(/\.[^.]*$/, '') + '.' + (РОЗШ[mime] || 'jpg');
    const f = new FormData();
    f.append('content', blob, імя);
    f.append('type', 'image');
    let r;
    try {
      r = await мета('POST', '/workspace/1/file', f);
    } catch (e) {
      console.error(`  ! файл не прийнято (${src}): ${e.message} — без цього зображення`);
      return null;
    }
    кеш[src] = { access: 'public', path: r.path, name: r.name, type: r.type, size: r.size, mime: r.mime, ...(meta ? { meta } : {}), url: XANO + r.path };
    fs.writeFileSync(КЕШ, JSON.stringify(кеш, null, 1));
  }
  return кеш[src];
};
const всі = async (t) => {
  let p = 1, out = [];
  for (;;) { const r = await мета('POST', `/workspace/1/table/${t}/content/search`, { page: p, per_page: 500 }); out.push(...r.items); if (!r.nextPage) break; p = r.nextPage; }
  return out;
};

// ---------- підготовка ----------
const рубрикиБД = await всі(70);
const idРубрики = {};
if (ЗАПИС) {
  const схема = await мета('GET', '/workspace/1/table/71/schema');
  if (!(схема.items || схема).some((f) => f.name === 'source_url')) {
    await мета('POST', '/workspace/1/table/71/schema/type/text', { name: 'source_url', description: 'Звідки перенесено (старий сайт) — для ідемпотентного переносу', nullable: true, required: false, access: 'public', filters: { trim: true } });
    console.log('news: додано поле source_url');
  }
}
for (const [i, [slug, name]] of РУБРИКИ.entries()) {
  let r = рубрикиБД.find((x) => x.slug === slug);
  if (!r && ЗАПИС) {
    r = await мета('POST', '/workspace/1/table/70/content', { created_at: Date.now(), updated_at: Date.now(), name, slug, competition_id: null, sort_order: (i + 1) * 10, is_active: true });
    console.log(`+ рубрика «${name}» #${r.id}`);
  }
  idРубрики[slug] = r?.id ?? `(нова) ${slug}`;
}
const новиниБД = await всі(71);
const є = new Set(новиниБД.flatMap((n) => [n.slug, n.source_url].filter(Boolean)));

// ---------- прохід ----------
const лік = { переглянуто: 0, нових: 0, пропущено: 0, обкладинок: 0, безОбкладинки: 0, помилок: 0 };
const заРубрикою = {};
for await (const { сторінка, усього, пачка } of пости()) {
  for (const p of пачка) {
    лік.переглянуто++;
    const source_url = p.link;
    if (є.has(p.slug) || є.has(source_url)) { лік.пропущено++; continue; }
    const рубрика = рубрикаПоста(p.categories);
    заРубрикою[рубрика] = (заРубрикою[рубрика] || 0) + 1;
    const fm = p._embedded?.['wp:featuredmedia']?.[0];
    const великий = fm?.media_details?.sizes?.large || fm?.media_details?.sizes?.full || (fm?.source_url ? { source_url: fm.source_url, width: fm.media_details?.width, height: fm.media_details?.height } : null);
    const малий = fm?.media_details?.sizes?.medium_large || fm?.media_details?.sizes?.medium || null;
    if (великий) лік.обкладинок++; else лік.безОбкладинки++;
    if (!ЗАПИС) { лік.нових++; continue; }
    try {
      const cover = великий ? await файл(великий.source_url, { width: великий.width, height: великий.height }) : null;
      const cover_thumb = малий ? await файл(малий.source_url, { width: малий.width, height: малий.height }) : null;
      const lead = текст(p.excerpt?.rendered).replace(/\s*\[…\]\s*$|\s*\[&hellip;\]\s*$|\s*…\s*$/, ''); const leadCut = обрізати(lead, 300) || текст(p.title?.rendered);
      const r = await мета('POST', '/workspace/1/table/71/content', {
        created_at: Date.now(), updated_at: Date.now(),
        title: текст(p.title?.rendered), slug: p.slug, category_id: idРубрики[рубрика], lead: leadCut,
        body_html: чисто(p.content?.rendered).toWellFormed(), cover, cover_alt: текст(fm?.alt_text || '') || текст(p.title?.rendered),
        cover_thumb, gallery: null, video_url: null, is_featured: false, status: 'published',
        published_at: Date.parse(p.date_gmt + 'Z'), created_by: null, updated_by: null, source_url,
      });
      є.add(p.slug); є.add(source_url);
      лік.нових++;
      if (лік.нових % 25 === 0) console.log(`  … записано ${лік.нових} (сторінка ${сторінка}/${усього}), остання #${r.id} ${p.date_gmt.slice(0, 10)}`);
    } catch (e) {
      лік.помилок++;
      console.error(`  ✗ ${p.slug}: ${e.message} ${JSON.stringify(e.дані || '').slice(0, 200)}`);
    }
  }
  console.log(`сторінка ${сторінка}/${усього}: ${JSON.stringify(лік)}`);
}
console.log(`\n${ЗАПИС ? 'ЗАПИС' : '[сухий прогін]'} ${ПІСЛЯ ? 'від ' + ПІСЛЯ : ''}${ДО ? ' до ' + ДО : ''}`);
console.log(JSON.stringify(лік));
console.log('за рубриками:', JSON.stringify(заРубрикою));
console.log('рубрики:', JSON.stringify(idРубрики));
