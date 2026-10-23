// КОПІЯ розбору Backend: docs/xano/drafts/arena-map/venue-map-parse.js у репо
// AFU (12bd168) — той самий текст іде в лямбду функції Xano «Venue map parse».
// Тут він лише для підказки під полем, поки посилання не збережене: так CRM
// класифікує посилання так само, як сервер. Не правити тут — правити в AFU й
// переносити дослівно (venueMap.test.js звіряє з оригіналом, якщо він поруч).
// Короткі посилання (kind short) розгортає лише сервер — тому без «переадресації».
/* eslint-disable no-unused-vars -- текст дослівний з AFU, catch (e) як там */

export function розібрати(текст) {
  const порожньо = { kind: 'empty', lat: null, lng: null, source: null, next: null, url: null };
  let url = typeof текст === 'string' ? текст.trim() : '';
  if (!url) return порожньо;
  // Із тексту «Поділитися» беремо саме посилання.
  const знайдене = url.match(/(https?:\/\/[^\s<>"']+|geo:[^\s<>"']+)/i);
  if (знайдене) url = знайдене[1];
  else if (/^(www\.|maps\.|goo\.gl|maps\.app\.goo\.gl|google\.)/i.test(url)) url = 'https://' + url.split(/\s/)[0];
  url = url.replace(/^http:\/\//i, 'https://');
  const результат = (kind, lat = null, lng = null, source = null, next = null) => ({ kind, lat, lng, source, next, url });

  const число = s => {
    const n = Number(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const точка = (a, b, source) => {
    const lat = число(a), lng = число(b);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    const к = x => Math.round(x * 1e6) / 1e6;
    return результат('place', к(lat), к(lng), source);
  };

  // geo:50.45,30.52?q=…
  const geo = url.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (geo) return точка(geo[1], geo[2], 'geo') || результат('no_coords');

  const м = url.match(/^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!м) return результат('not_google');
  const хост = м[1].toLowerCase().replace(/:\d+$/, '');
  const шлях = м[2] || '/';
  const запит = м[3] || '';

  // Короткі: maps.app.goo.gl/…, goo.gl/maps/…, g.co/kgs/…
  if (хост === 'maps.app.goo.gl' || (хост === 'goo.gl' && /^\/maps\//i.test(шлях)) || (хост === 'g.co' && /^\/kgs\//i.test(шлях))) {
    return шлях.length > 1 && !/^\/(maps\/?)?$/i.test(шлях) ? результат('short', null, null, null, url) : результат('not_google');
  }

  const google = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(хост);
  const картиGoogle = google && (/^maps\./.test(хост) || /^\/maps(\/|$)/i.test(шлях) || (хост.startsWith('www.') && шлях === '/' && /[?&](q|ll|cid)=/.test(запит)));
  // Звичайний пошук Google (google.<домен>/search?q=…) — теж пошук, а не місце.
  if (google && /^\/search(\/|$)/i.test(шлях)) return результат('search');
  if (!картиGoogle) return результат('not_google');

  let розкодоване = url;
  try { розкодоване = decodeURIComponent(url.replace(/\+/g, ' ')); } catch (e) { /* лишаємо як є */ }

  // 1) Мітка місця в data=…: !3d<lat>!4d<lng> — найточніше.
  const мітка = розкодоване.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (мітка) {
    const т = точка(мітка[1], мітка[2], '3d4d');
    if (т) return т;
  }
  // 2) Параметри з координатами: q=, query=, ll=, destination=, daddr=, center=; «loc:» теж.
  const параметр = розкодоване.match(/[?&](?:q|query|ll|sll|destination|daddr|center)=(?:loc:)?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?=$|[&#\s(])/i);
  if (параметр) {
    const т = точка(параметр[1], параметр[2], 'q');
    if (т) return т;
  }
  const пошук = /^\/maps\/(search|dir)(\/|$)/i.test(шлях);
  // 3) @lat,lng — центр карти; для пошуку й маршруту це не арена.
  const центр = розкодоване.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|z|$)/);
  if (центр && !пошук) {
    const т = точка(центр[1], центр[2], 'at');
    if (т) return т;
  }
  if (пошук) return результат('search');
  if (/[?&]q=[^&]*[^\d\s,.+-][^&]*/i.test(запит) && !/[?&](ftid|cid)=/i.test(запит) && !/^\/maps\/place\//i.test(шлях)) return результат('search');
  return результат('no_coords');
}
