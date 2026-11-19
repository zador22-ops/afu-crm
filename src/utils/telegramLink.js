// Telegram клубу в картці CRM АФУ — ПОСИЛАННЯ на канал, не нік (Андрій 19.11). Застосунок показує іконку
// лише для адреси з http(s):// (SocialLinks.usableLink), тож «@club» чи «t.me/club» доводимо до повної адреси.

const ІМʼЯ = /^[A-Za-z0-9_]{3,64}$/;
const ДОМЕН = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/(.+)$/i;

export const ПОМИЛКА_TELEGRAM = 'Вкажіть посилання на канал, напр. https://t.me/назва_каналу (або @назва_каналу)';

/**
 * Нормалізація поля «Telegram»: { ok, url, error }.
 *   ''                         → url null (поле очищено)
 *   '@name' / 't.me/name'      → https://t.me/name
 *   'https://…' з доменом      → як є
 *   'щось.домен/шлях' без схеми → https://…
 *   'name' без домену й «@»    → помилка (це не посилання)
 */
export function посиланняTelegram(текст) {
  const t = String(текст ?? '').trim();
  if (!t) return { ok: true, url: null, error: null };
  if (t.startsWith('@')) {
    const імʼя = t.slice(1);
    return ІМʼЯ.test(імʼя) ? { ok: true, url: `https://t.me/${імʼя}`, error: null } : { ok: false, url: null, error: ПОМИЛКА_TELEGRAM };
  }
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      return u.hostname.includes('.') ? { ok: true, url: t, error: null } : { ok: false, url: null, error: ПОМИЛКА_TELEGRAM };
    } catch {
      return { ok: false, url: null, error: ПОМИЛКА_TELEGRAM };
    }
  }
  const тг = t.match(ДОМЕН);
  if (тг) return { ok: true, url: `https://t.me/${тг[1]}`, error: null };
  // інший домен без схеми: «site.ua/tg» → https://site.ua/tg; без крапки в домені — не посилання
  if (/^[^\s/]+\.[^\s/]+(\/\S*)?$/.test(t) && !/\s/.test(t)) return { ok: true, url: `https://${t}`, error: null };
  return { ok: false, url: null, error: ПОМИЛКА_TELEGRAM };
}
