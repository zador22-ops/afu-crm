import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { crm } from '../api/client.js';
import { ДО_СКАРГ, КЛЮЧ_СКАРГ, ОНОВЛЮВАТИ_КОЖНІ, ШЛЯХ_СКАРГ, кількістьСкарг, можнаПитати, повторСкарг, скаргиСловами } from '../utils/gameReports.js';

// Скарги на ніки гри видно одразу після входу, на будь-якій сторінці: лічильник
// біля «Налаштування» і пункту «Влуч у ворота», плашка на головній. Чому
// без окремого ендпоінта і чому 403 означає «не показувати» — utils/gameReports.js.

/** Скільки скарг чекає модератора; 0 — нема, нема права або ще не відомо. */
export function useСкаргиГри() {
  const q = useQuery({
    queryKey: КЛЮЧ_СКАРГ,
    queryFn: () => crm.get(ШЛЯХ_СКАРГ),
    // Після 403 вимкнено все разом: інтервал, фокус і повтор при монтуванні
    enabled: (query) => можнаПитати(query.state.error),
    refetchInterval: ОНОВЛЮВАТИ_КОЖНІ,
    retry: повторСкарг,
    // Модератор повернувся до вкладки після обіду — число має бути свіже одразу,
    // а не через 5 хв. В усій CRM це вимкнено; тут запит дешевий.
    refetchOnWindowFocus: true,
  });
  return кількістьСкарг(q.data);
}

export function ReportsBadge({ n }) {
  if (!n) return null;
  return (
    <span className="count-badge" title={скаргиСловами(n)} aria-label={скаргиСловами(n)}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function ReportsBanner() {
  const n = useСкаргиГри();
  if (!n) return null;
  return (
    <Link to={ДО_СКАРГ} className="reports-banner">
      <span>
        Скарги на нікнейми гри: <strong>{n}</strong>
      </span>
      <span className="reports-banner-go">переглянути →</span>
    </Link>
  );
}
