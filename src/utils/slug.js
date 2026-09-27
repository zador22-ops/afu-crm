// Адреса новини чи рубрики латиницею: «Екстра-ліга» → «ekstra-liha».
// Транслітерація за постановою КМУ № 55 від 27.01.2010 — та сама, що в
// паспортах і на futsal.com.ua. Особливі випадки: є/ї/й/ю/я на початку слова
// (ye, yi, y, yu, ya), «зг» → «zgh», апостроф і м'який знак зникають.
const ЛІТЕРИ = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia',
  // російські літери трапляються в назвах клубів і цитатах
  ё: 'io', ъ: '', ы: 'y', э: 'e',
};
const НА_ПОЧАТКУ = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };

export function translit(text) {
  const s = String(text || '').toLowerCase().replace(/[’'ʼ`]/g, '').replace(/зг/g, 'zgh');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const початок = i === 0 || !/[a-zа-яіїєґ]/i.test(s[i - 1]);
    if (початок && НА_ПОЧАТКУ[ch]) out += НА_ПОЧАТКУ[ch];
    else if (ch in ЛІТЕРИ) out += ЛІТЕРИ[ch];
    else out += ch;
  }
  return out;
}

export function makeSlug(text, max = 80) {
  const s = translit(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, cut.lastIndexOf('-') > 20 ? cut.lastIndexOf('-') : max).replace(/-+$/, '');
}

export const slugValid = (s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(s || ''));
