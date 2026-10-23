// «Проблеми з даними» (бриф crm-data-issues): групування відповіді
// GET crm/data-issues за рівнями й підписи. Перевірки рахує сервер
// (xano/crm/data-issues.get.xs).

export const РІВНІ = {
  critical: { назва: 'Критично', опис: 'Видно людям і неправильно або блокує роботу' },
  important: { назва: 'Важливо', опис: 'Видно, але в застосунку є запасний варіант' },
  advice: { назва: 'Рекомендація', опис: 'Історія чи службове' },
};

/** [{ level, назва, опис, перевірки, проблем }] — у порядку рівнів; кількість — сумарна. */
export function групи(checks) {
  return Object.entries(РІВНІ).map(([level, р]) => {
    const перевірки = (checks || []).filter((c) => c.level === level);
    return { level, ...р, перевірки, проблем: перевірки.reduce((s, c) => s + (c.count || 0), 0) };
  });
}

/** «140 з 140» чи просто «5» */
export const кількість = (c) => (c.total != null ? `${c.count} з ${c.total}` : String(c.count));

export function підсумок(checks) {
  const n = (checks || []).reduce((s, c) => s + (c.count || 0), 0);
  return n ? `Знайдено проблем: ${n}` : 'Проблем не знайдено';
}
