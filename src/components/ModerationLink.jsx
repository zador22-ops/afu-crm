import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { маєПраво } from '../utils/clubAccounts.js';

// Право 21 «Модерація заявок клубів» (сервер перевіряє сам; тут — щоб не показувати пункт меню)
const ПРАВО_МОДЕРАЦІЯ = 21;

/** Пункт меню «Погодження» (4.1): лише з правом 21; число пакетів, що чекають рішення. */
export default function ModerationLink() {
  const { user } = useAuth();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => crm.get('/roles') });
  const можна = маєПраво(roles.data, user?.types_of_user_roles_id, ПРАВО_МОДЕРАЦІЯ);
  const q = useQuery({
    queryKey: ['moderation-count'],
    queryFn: () => crm.get('/moderation/count'),
    enabled: можна,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
  const пакетів = q.data?.batches || 0;
  if (!можна) return null;
  return (
    <NavLink to="/moderation" className={({ isActive }) => (isActive ? 'active' : '')}>
      Погодження
      {пакетів > 0 && (
        <span className="count-badge" title={`Чекають рішення: ${пакетів}`}>
          {пакетів > 99 ? '99+' : пакетів}
        </span>
      )}
    </NavLink>
  );
}
