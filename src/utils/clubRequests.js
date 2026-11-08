// Вкладка «Заявки» кабінету клубу (самообслуговування клубів, 2.3): як
// назвати заявку, її статус і перелік змін «було → стане» людською мовою.
// Сервер — GET crm/club/clubs/{id}/requests.
import { ПОЛЯ_КАРТКИ, ФОТО_КАРТКИ } from './clubDraft.js';

export const ПІДПИСИ = {
  ...Object.fromEntries([...ПОЛЯ_КАРТКИ, ...ФОТО_КАРТКИ].map((п) => [п.key, п.label])),
  venue_suggestion: 'Запропонована арена',
  prizvushche: 'Прізвище',
  Name: "Ім'я",
  po_batkovi: 'По батькові',
  Date_of_birth: 'Дата народження',
  Photo: 'Фото',
  City: 'Місто',
  Growth: 'Зріст',
  Weight: 'Вага',
  Number: 'Номер',
  positions_id: 'Позиція',
  Captain: 'Капітан',
  End_date: 'Дата виведення',
  end_date: 'Дата виведення',
};

export const СТАТУСИ = {
  draft: { текст: 'чернетка', тон: 'muted' },
  submitted: { текст: 'на погодженні', тон: 'wait' },
  approved: { текст: 'погоджено, застосовується', тон: 'ok' },
  applied: { текст: 'погоджено', тон: 'ok' },
  rejected: { текст: 'повернуто', тон: 'bad' },
  failed: { текст: 'погоджено, але не застосовано — АФУ розбирається', тон: 'bad' },
};

export const статусЗаявки = (s) => СТАТУСИ[s] || { текст: s || '—', тон: 'muted' };

const ДІЇ_СКЛАДУ = { create: 'новий у складі', update: 'зміни', remove: 'виведення зі складу', transfer: 'перехід' };
const ДІЇ_ШТАБУ = { create: 'новий у штабі', update: 'зміна посади', remove: 'виведення зі штабу' };

/** Заголовок заявки: «Картка клубу», «Гравець Іваненко Петро — новий у складі · Екстра-ліга» тощо. */
export function назваЗаявки(r) {
  const хто = r.person_name || 'без імені';
  if (r.entity === 'club') return 'Картка клубу';
  if (r.entity === 'person') return r.action === 'create' ? `Нова особа: ${хто}` : `Дані особи: ${хто}`;
  if (r.entity === 'squad_row') {
    const дія = r.action === 'transfer' && r.transfer_from_name ? `перехід з «${r.transfer_from_name}»` : ДІЇ_СКЛАДУ[r.action] || r.action;
    return [`Гравець ${хто} — ${дія}`, r.league_name].filter(Boolean).join(' · ');
  }
  if (r.entity === 'staff_row') return `Штаб: ${хто} — ${ДІЇ_ШТАБУ[r.action] || r.action}`;
  return r.entity;
}

const показ = (v) => {
  if (v == null || v === '') return '—';
  if (typeof v === 'object') return v.url ? 'зображення' : '…';
  if (typeof v === 'boolean') return v ? 'так' : 'ні';
  return String(v);
};

/** Позиція й домашня арена — назвою з довідника сервера (labels), без нього — як є (приймання PM 1, 05.11). */
const назвою = (k, v, labels) => {
  if (v == null || v === '') return v;
  if (k === 'positions_id') return labels?.positions?.[v] || v;
  if (k === 'home_venues_id') return labels?.venues?.[v] || v;
  return v;
};

/** Зміни «поле: було → стане»; зображення — окремо (для прев'ю). labels — довідник назв із GET …/requests. */
export function зміниЗаявки(r, labels) {
  const після = r.after || {};
  const до = r.before || {};
  return Object.keys(після).map((k) => ({
    key: k,
    label: ПІДПИСИ[k] || k,
    було: показ(назвою(k, до[k], labels)),
    стане: показ(назвою(k, після[k], labels)),
    фото: після[k] && typeof після[k] === 'object' && після[k].url ? { стане: після[k].url, було: до[k]?.url || null } : null,
  }));
}

/** Підсумок пакета: «3 заявки: 2 погоджено, 1 повернуто». */
export function підсумокПакета(requests) {
  const р = Array.isArray(requests) ? requests : [];
  const к = (s) => р.filter((r) => s.includes(r.status)).length;
  const ч = [
    к(['applied', 'approved']) && `${к(['applied', 'approved'])} погоджено`,
    к(['rejected']) && `${к(['rejected'])} повернуто`,
    к(['submitted']) && `${к(['submitted'])} на погодженні`,
    к(['failed']) && `${к(['failed'])} не застосовано`,
  ].filter(Boolean);
  return `${р.length} ${р.length % 10 === 1 && р.length % 100 !== 11 ? 'заявка' : [2, 3, 4].includes(р.length % 10) && ![12, 13, 14].includes(р.length % 100) ? 'заявки' : 'заявок'}${ч.length ? ': ' + ч.join(', ') : ''}`;
}
