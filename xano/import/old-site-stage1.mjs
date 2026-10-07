#!/usr/bin/env node
/**
 * Перенос зі старого сайту futsal.com.ua, етап 1: органи управління, документи, партнери.
 * Бриф: afu-futzal docs/reports/perenos-staroho-saitu-2026-10-07.md.
 *
 *   node xano/import/old-site-stage1.mjs          — сухий прогін: план і цифри, у базу нічого
 *   node xano/import/old-site-stage1.mjs --write  — запис (ідемпотентно за source_url)
 *
 * Джерело — відкритий WordPress REST (`wp-json/wp/v2/pages`, `media`) і HTML головної
 * (партнери в підвалі). Файли й фото завантажуються у vault Xano, не хотлінком.
 */
import { мета } from '../meta.mjs';

const WP = 'https://futsal.com.ua/wp-json/wp/v2';
const ЗАПИС = process.argv.includes('--write');

const html = (s) =>
  String(s || '')
    .replace(/&#8221;|&#8243;|&#8222;|&#8220;/g, '"')
    .replace(/&#8211;|&#8212;/g, '–')
    .replace(/&#8217;|&#039;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
const текст = (s) => html(s).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+/g, ' ');

const сторінка = async (slug) => {
  const [p] = await (await fetch(`${WP}/pages?slug=${slug}&_fields=id,link,content`)).json();
  return { url: p.link, raw: html(p.content.rendered) };
};
const медіа = new Map();
const фото = async (id) => {
  if (!медіа.has(id)) {
    const m = await (await fetch(`${WP}/media/${id}?_fields=id,source_url,title,media_details`)).json();
    медіа.set(id, { id, url: m.source_url, title: текст(m.title?.rendered || ''), w: m.media_details?.width, h: m.media_details?.height });
  }
  return медіа.get(id);
};

// «Прізвище Ім'я По батькові»; два слова в зворотному порядку на сайті — винятки нижче
const ІМЕНА_СПЕРЕДУ = new Set(['Ігор', 'Юрій']);
const піб = (повне) => {
  const t = повне.replace(/\s+/g, ' ').trim().split(' ');
  if (t.length === 2 && ІМЕНА_СПЕРЕДУ.has(t[0])) return { last_name: t[1], first_name: t[0], middle_name: null };
  return { last_name: t[0] || '', first_name: t[1] || '', middle_name: t.slice(2).join(' ') || null };
};

/** Сторінка з фото: послідовність [vc_single_image image=N] → текст «ПІБ (посада)». */
async function людиЗФото(slug) {
  const { url, raw } = await сторінка(slug);
  const блоки = [...raw.matchAll(/\[vc_single_image image="(\d+)"[^\]]*\]\s*\[vc_column_text\]([\s\S]*?)\[\/vc_column_text\]/g)];
  const люди = [];
  for (const [, img, t] of блоки) {
    const рядки = текст(t).split('\n').map((s) => s.trim()).filter(Boolean);
    const імя = (рядки[0] || '').replace(/\s*\|\s*$/, '').trim();
    const посада = (рядки.find((r) => /^\(.*\)$/.test(r)) || '').replace(/^\(|\)$/g, '').trim() || null;
    if (імя) люди.push({ ...піб(імя), full: імя, position: посада, photo_id: Number(img) });
  }
  return { url, люди };
}

/** Комітети: [vc_tta_section title="…"] з телефоном, email і рядками «ПІБ – роль». */
async function комітети() {
  const { url, raw } = await сторінка('komitety');
  const секції = [...raw.matchAll(/\[vc_tta_section[^\]]*?title="([^"]+)"[^\]]*\]([\s\S]*?)\[\/vc_tta_section\]/g)];
  return {
    url,
    органи: секції.map(([, назва, тіло]) => {
      const рядки = текст(тіло).replace(/\[[^\]]+\]/g, '\n').split(/\n|\|/).map((s) => s.trim()).filter(Boolean);
      const тел = рядки.filter((r) => /^Тел/i.test(r)).map((r) => r.replace(/^Тел:?\s*/i, ''));
      const пошта = рядки.filter((r) => /^Email/i.test(r)).map((r) => r.replace(/^Email:?\s*/i, ''));
      const члени = рядки
        .filter((r) => !/^(Тел|Email)/i.test(r))
        .map((r) => {
          const [імя, ...роль] = r.split(/\s+[–-]\s+/);
          const email = (r.match(/\(([^)]+@[^)]+)\)/) || [])[1] || null;
          return { ...піб(імя.replace(/\([^)]*\)/, '').trim()), full: імя.trim(), position: роль.join(' – ').replace(/\([^)]*@[^)]*\)/, '').trim() || 'член комітету', email };
        });
      return { name: html(назва).trim(), phone: тел.join(', ') || null, email: пошта.join(', ') || null, члени };
    }),
  };
}

/** Документи: заголовок перед кожною кнопкою «ПЕРЕГЛЯНУТИ». */
async function документи(slug) {
  const { url, raw } = await сторінка(slug);
  const out = [];
  const re = /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g;
  let m, від = 0;
  while ((m = re.exec(raw))) {
    if (!/\.(pdf|docx?|xlsx?)$/i.test(m[1])) continue;
    const перед = текст(raw.slice(від, m.index)).replace(/\[[^\]]+\]/g, '\n').split('\n').map((s) => s.trim()).filter((s) => s && !/ПЕРЕГЛЯНУТИ/i.test(s));
    out.push({ title: перед.pop() || decodeURIComponent(m[1].split('/').pop()), file: m[1], page: url });
    від = m.index + m[0].length;
  }
  return out;
}

const сезон = (t) => (/2026\s*\/\s*(20)?27/.test(t) ? 3 : /2025\s*\/\s*(20)?26/.test(t) ? 2 : /2024\s*\/\s*(20)?25/.test(t) ? 1 : null);

async function партнери() {
  const h = html(await (await fetch('https://futsal.com.ua/')).text());
  const ПІДПИСИ = [
    ['ГЕНЕРАЛЬНИЙ СПОНСОР НАЦІОНАЛЬНИХ ЗБІРНИХ З ФУТЗАЛУ', 'BETKING', null, 'генеральний спонсор національних збірних'],
    ['ТИТУЛЬНИЙ ПАРТНЕР ЕКСТРА-ЛІГИ ТА КУБКУ УКРАЇНИ', 'BETKING', null, 'титульний партнер Екстра-ліги та Кубку України'],
    ['ІТ-ПАРТНЕР', 'in.IT Services', 'https://initservice.com.ua/', 'ІТ-партнер'],
    ['ТЕХНІЧНИЙ ПАРТНЕР', 'Select Sport', 'https://select-sport.com.ua/', 'технічний партнер'],
    ['ОФІЦІЙНИЙ ПОСТАЧАЛЬНИК ДАНИХ', 'Statscore', 'https://www.statscore.com/', 'офіційний постачальник даних'],
  ];
  const лого = {
    BETKING: 'https://futsal.com.ua/wp-content/uploads/2026/09/logo6.png',
    'in.IT Services': (h.match(/initservice\.com\.ua[\s\S]{0,600}?srcset="(https:\/\/futsal\.com\.ua\/[^ "]+)/) || [])[1] || null,
    'Select Sport': (h.match(/select-sport\.com\.ua[\s\S]{0,600}?srcset="(https:\/\/futsal\.com\.ua\/[^ "]+)/) || [])[1] || null,
    Statscore: 'https://futsal.com.ua/wp-content/uploads/2024/10/Statscore-Logo-Green.png',
  };
  return ПІДПИСИ.filter(([cap]) => h.includes(cap)).map(([cap, name, url, category], i) => ({
    name, url, category, logo: лого[name], sort_order: i + 1, source_url: `https://futsal.com.ua/#partner:${cap}`,
  }));
}

// ---------- план ----------
const plan = { bodies: [], members: [], documents: [], categories: [], partners: [] };
for (const [slug, kind, name] of [
  ['prezydiia', 'presidium', 'Президія'],
  ['vykonavchyy-komitet', 'executive_committee', 'Виконавчий комітет'],
  ['vykonavcha-dyrektsiia', 'directorate', 'Виконавча дирекція'],
]) {
  const { url, люди } = await людиЗФото(slug);
  plan.bodies.push({ name, slug, kind, source_url: url });
  люди.forEach((l, i) => plan.members.push({ body: slug, ...l, sort_order: i + 1, source_url: `${url}#${encodeURIComponent(l.full)}` }));
}
const к = await комітети();
const ТР = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', '’': '', "'": '' };
const слаг = (t) => t.toLowerCase().split('').map((c) => (c in ТР ? ТР[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const трансліт = Object.fromEntries(к.органи.map((o) => [o.name, слаг(o.name)]));
к.органи.forEach((o, i) => {
  const slug = 'komitet-' + (i + 1);
  plan.bodies.push({ name: o.name, slug: трансліт[o.name] || slug, kind: 'committee', phone: o.phone, contact_email: o.email, source_url: `${к.url}#${encodeURIComponent(o.name)}` });
  o.члени.forEach((l, j) => plan.members.push({ body: трансліт[o.name] || slug, ...l, photo_id: null, sort_order: j + 1, source_url: `${к.url}#${encodeURIComponent(o.name)}:${encodeURIComponent(l.full)}` }));
});
// Фото-заглушка: той самий файл у різних людей → без фото
const хто = new Map();
for (const m of plan.members) if (m.photo_id) хто.set(m.photo_id, new Set([...(хто.get(m.photo_id) || []), m.full]));
for (const m of plan.members) if (m.photo_id && хто.get(m.photo_id).size > 1) m.photo_id = null;
for (const m of plan.members) if (m.photo_id) m.photo = await фото(m.photo_id);

for (const [slug, name, sort] of [['normatyvni', 'Нормативні', 1], ['rehlamentni', 'Регламентні', 2], ['rishennia-ou', 'Рішення ОУ', 3]]) {
  plan.categories.push({ name, slug, sort_order: sort });
  (await документи(slug)).forEach((d, i) => plan.documents.push({ ...d, category: slug, season_id: сезон(d.title), sort_order: i + 1, source_url: `${d.file}#${slug}` }));
}
plan.partners = await партнери();

const файли = new Set([...plan.members.filter((m) => m.photo).map((m) => m.photo.url), ...plan.documents.map((d) => d.file), ...plan.partners.map((p) => p.logo).filter(Boolean)]);
console.log(JSON.stringify({
  органів: plan.bodies.length,
  членів: plan.members.length,
  'членів з фото': plan.members.filter((m) => m.photo).length,
  'категорій документів': plan.categories.length,
  документів: plan.documents.length,
  партнерів: plan.partners.length,
  'файлів у vault (унікальних)': файли.size,
}, null, 1));
for (const b of plan.bodies) {
  const ч = plan.members.filter((m) => m.body === b.slug);
  console.log(`\n${b.name} [${b.kind}]${b.phone ? ' тел ' + b.phone : ''}${b.contact_email ? ' · ' + b.contact_email : ''} — ${ч.length}`);
  for (const m of ч) console.log(`  ${m.last_name} ${m.first_name}${m.middle_name ? ' ' + m.middle_name : ''} — ${m.position || '—'}${m.photo ? ` · фото ${m.photo.w}×${m.photo.h}` : ''}`);
}
console.log('\nДокументи:');
for (const d of plan.documents) console.log(`  [${d.category}] ${d.title}${d.season_id ? ' · сезон ' + d.season_id : ''} — ${d.file.split('/').pop()}`);
console.log('\nПартнери:');
for (const p of plan.partners) console.log(`  ${p.name} — ${p.category}${p.url ? ' · ' + p.url : ''} · лого ${p.logo ? p.logo.split('/').pop() : 'НЕМАЄ'}`);
if (!ЗАПИС) {
  console.log('\n[сухий прогін] у базу нічого не записано');
} else {
  await записати(plan);
}

// ---------- запис ----------
async function записати(plan) {
  const fs = await import('node:fs');
  const КЕШ = new URL('./files-cache.json', import.meta.url);
  const кеш = fs.existsSync(КЕШ) ? JSON.parse(fs.readFileSync(КЕШ, 'utf8')) : {};
  const XANO = 'https://xdeg-kg7i-jjtu.f2.xano.io';
  const файл = async (src, image, meta) => {
    if (!src) return null;
    if (!кеш[src]) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`не завантажився ${src}: ${res.status}`);
      const mime = res.headers.get('content-type') || 'application/octet-stream';
      const blob = new Blob([await res.arrayBuffer()], { type: mime });
      const f = new FormData();
      f.append('content', blob, decodeURIComponent(src.split('/').pop().split('?')[0]));
      if (image) f.append('type', 'image');
      const r = await мета('POST', '/workspace/1/file', f);
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
  const додати = async (t, наявні, ключ, дані, назва) => {
    const є = наявні.find((r) => r[ключ] === дані[ключ]);
    if (є) return { рядок: є, нове: false };
    const r = await мета('POST', `/workspace/1/table/${t}/content`, { created_at: Date.now(), updated_at: Date.now(), ...дані });
    наявні.push(r);
    console.log(`  + ${назва} #${r.id}`);
    return { рядок: r, нове: true };
  };
  const лік = { органів: 0, членів: 0, категорій: 0, документів: 0, партнерів: 0 };

  console.log('\nЗапис: органи');
  const тілаБД = await всі(75), членБД = await всі(76);
  const idТіла = {};
  for (const [i, b] of plan.bodies.entries()) {
    // Поле пошти розраховане на одну адресу: першу туди, решту — в опис
    const [пошта, ...інші] = String(b.contact_email || '').split(/,\s*/).filter(Boolean);
    const { рядок, нове } = await додати(75, тілаБД, 'source_url', { name: b.name, slug: b.slug, kind: b.kind, description: інші.length ? `Також пошта: ${інші.join(', ')}` : null, contact_email: пошта || null, contact_phone: b.phone || null, sort_order: i + 1, is_active: true, source_url: b.source_url }, `орган «${b.name}»`);
    idТіла[b.slug] = рядок.id;
    if (нове) лік.органів++;
  }
  for (const m of plan.members) {
    const photo = m.photo ? await файл(m.photo.url, true, { width: m.photo.w, height: m.photo.h }) : null;
    const { нове } = await додати(76, членБД, 'source_url', { body_id: idТіла[m.body], first_name: m.first_name, last_name: m.last_name, middle_name: m.middle_name, position: m.position, photo, sort_order: m.sort_order, is_active: true, source_url: m.source_url }, `член ${m.last_name} ${m.first_name}`);
    if (нове) лік.членів++;
  }

  console.log('\nЗапис: документи');
  const катБД = await всі(73), докБД = await всі(74);
  const idКат = {};
  for (const c of plan.categories) {
    const { рядок, нове } = await додати(73, катБД, 'slug', { name: c.name, slug: c.slug, sort_order: c.sort_order, is_active: true }, `категорія «${c.name}»`);
    idКат[c.slug] = рядок.id;
    if (нове) лік.категорій++;
  }
  for (const d of plan.documents) {
    const file = await файл(d.file, false);
    const { нове } = await додати(74, докБД, 'source_url', { title: d.title, category_id: idКат[d.category], file, description: null, document_date: null, season_id: d.season_id, is_published: true, sort_order: d.sort_order, source_url: d.source_url }, `документ «${d.title}»`);
    if (нове) лік.документів++;
  }

  console.log('\nЗапис: партнери');
  const партБД = await всі(72);
  for (const p of plan.partners) {
    const logo = await файл(p.logo, true);
    const { нове } = await додати(72, партБД, 'source_url', { name: p.name, logo, url: p.url, category: p.category, is_active: true, sort_order: p.sort_order, source_url: p.source_url }, `партнер ${p.name} (${p.category})`);
    if (нове) лік.партнерів++;
  }
  console.log('\nДодано:', JSON.stringify(лік), '| файлів у кеші:', Object.keys(кеш).length);
}
export { plan };
