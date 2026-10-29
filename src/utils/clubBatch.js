// Пакет заявок клубу (самообслуговування клубів, 2.2): підсумок чернеток для
// кнопки «Надіслати на погодження» («Картка: 4 зміни · Гравців: +3, змінено 2,
// виведено 1 · Штаб: +1», ТЗ 4.1). Сервер — GET club/clubs/{id}/pending,
// POST …/submit, POST …/batches/{id}/withdraw.

const мн = (n, [одна, кілька, багато]) => {
  const д = n % 100;
  const о = n % 10;
  if (д >= 11 && д <= 14) return багато;
  if (о === 1) return одна;
  if (о >= 2 && о <= 4) return кілька;
  return багато;
};

/** Підсумок чернеток; порожньо — ''. */
export function підсумокЧернеток(drafts) {
  const р = Array.isArray(drafts) ? drafts : [];
  const частини = [];
  const картка = р.filter((d) => d.entity === 'club').reduce((s, d) => s + Object.keys(d.after || {}).length, 0);
  if (картка) частини.push(`Картка: ${картка} ${мн(картка, ['зміна', 'зміни', 'змін'])}`);
  for (const [entity, назва] of [['squad_row', 'Гравців'], ['staff_row', 'Штаб']]) {
    const з = (a) => р.filter((d) => d.entity === entity && a.includes(d.action)).length;
    const плюс = з(['create', 'transfer']);
    const змінено = з(['update']);
    const виведено = з(['remove']);
    const ч = [плюс && `+${плюс}`, змінено && `змінено ${змінено}`, виведено && `виведено ${виведено}`].filter(Boolean);
    if (ч.length) частини.push(`${назва}: ${ч.join(', ')}`);
  }
  // Зміни самої особи (ПІБ, фото…) без рядка складу — окремо
  const особи = р.filter((d) => d.entity === 'person' && d.action === 'update').length;
  if (особи) частини.push(`Дані гравців: ${особи}`);
  return частини.join(' · ');
}

/** Коли знову можна надіслати — «о 14:05» за Києвом; null — можна зараз. */
export function колиЗнову(nextSubmitAt, now = Date.now()) {
  if (!nextSubmitAt || nextSubmitAt <= now) return null;
  return new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' }).format(new Date(nextSubmitAt));
}
