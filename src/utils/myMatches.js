// «Мої матчі» для ролі «Делегат» (PM 2, 21.10; делегати з iPhone ведуть
// матчі в CRM з 23.10). Лише фронт: у групі crm немає «матчів делегата» —
// GET /matches вимагає турнір. Тому, як і ADMIN 2.0 (AFU-ADMIN-APP,
// src/api/queries.js), збираємо поточний сезон → його турніри → матчі кожного
// турніру й фільтруємо за Match.users_idDelegat на клієнті.
//
// Це зручність, а не захист: права на сервері від ролі не залежать, і
// делегат з правом 2 може відкрити будь-який матч за посиланням.

// Ролі з таблиці Types of user roles (src/auth/AuthContext.jsx, РОЛІ)
export const ДЕЛЕГАТ = 2;

export const чиДелегат = (user) => Number(user?.types_of_user_roles_id) === ДЕЛЕГАТ;

/** Поточний сезон: позначений is_current, інакше перший у списку. */
export const поточнийСезон = (seasons) => (seasons || []).find((s) => s.is_current) || (seasons || [])[0] || null;

export const мійМатч = (m, userId) => userId != null && Number(m?.users_idDelegat) === Number(userId);

const ІДЕ = [3, 5]; // «Онлайн», «Призупинено»
// Матч, що почався до 3 год тому й не закритий, ще «найближчий»: делегат
// повертається до нього під час гри, навіть якщо статус ще «Запланований».
const ЗАПАС = 3 * 3600 * 1000;

/**
 * Найближчі зверху: спершу ті, що йдуть (онлайн чи на паузі), далі майбутні
 * за часом, далі минулі — найсвіжіші першими.
 */
export function упорядкувати(matches, now = Date.now()) {
  const час = (m) => Number(m?.TimeOfMatch) || 0;
  const група = (m) => (ІДЕ.includes(Number(m?.match_status_id)) ? 0 : час(m) >= now - ЗАПАС ? 1 : 2);
  return [...(matches || [])].sort((a, b) => {
    const ga = група(a);
    const gb = група(b);
    if (ga !== gb) return ga - gb;
    return ga === 2 ? час(b) - час(a) : час(a) - час(b);
  });
}
