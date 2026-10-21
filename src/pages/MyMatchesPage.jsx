import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Empty, ErrorBox, PageHeader } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';
import { мійМатч, поточнийСезон, упорядкувати, чиДелегат } from '../utils/myMatches.js';
import { зПричиною } from '../utils/postpone.js';

/**
 * «Мої матчі» — стартова сторінка делегата (PM 2, 21.10): матчі поточного
 * сезону, де він призначений делегатом, найближчі зверху. Перемикач «Усі
 * матчі» — коли призначення ще не внесли, а матч вести треба.
 *
 * Матчі збираються по турнірах сезону (src/utils/myMatches.js — чому так).
 */
export default function MyMatchesPage() {
  const { user } = useAuth();
  const [усі, setУсі] = useState(!чиДелегат(user));

  const q = useQuery({
    queryKey: ['season-matches'],
    queryFn: async () => {
      const сезон = поточнийСезон(await crm.get('/seasons'));
      if (!сезон) return { сезон: null, матчі: [] };
      const турніри = (await crm.get('/tournaments', { season_id: сезон.id })) || [];
      const списки = await Promise.all(турніри.map((t) => crm.get('/matches', { leagues_id: t.id })));
      const назва = new Map(турніри.map((t) => [t.id, t.League]));
      return { сезон, матчі: списки.flat().map((m) => ({ ...m, _турнір: назва.get(m.leagues_id) || '' })) };
    },
    staleTime: 60_000,
  });

  const список = useMemo(() => {
    const матчі = q.data?.матчі || [];
    return упорядкувати(усі ? матчі : матчі.filter((m) => мійМатч(m, user?.id)));
  }, [q.data, усі, user?.id]);

  return (
    <div className="page">
      <PageHeader
        title={усі ? 'Усі матчі' : 'Мої матчі'}
        subtitle={[
          q.data?.сезон?.name,
          усі ? 'усі матчі сезону' : 'де ви призначені делегатом',
          'ті, що йдуть, і найближчі — зверху',
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <div className="club-cell" role="radiogroup" aria-label="Які матчі">
            <button type="button" role="radio" aria-checked={!усі} className={усі ? 'btn' : 'btn primary'} onClick={() => setУсі(false)}>
              Мої
            </button>
            <button type="button" role="radio" aria-checked={усі} className={усі ? 'btn primary' : 'btn'} onClick={() => setУсі(true)}>
              Усі матчі
            </button>
          </div>
        }
      />
      <ErrorBox error={q.error} />
      {q.isPending && <div className="center muted">Завантаження…</div>}
      {q.data && список.length === 0 && (
        <Empty>
          {усі
            ? 'У поточному сезоні матчів немає'
            : 'Вас ще не призначено делегатом на жоден матч сезону. Якщо матч треба вести зараз — «Усі матчі»'}
        </Empty>
      )}
      {список.length > 0 && (
        <table className="table cards">
          <thead>
            <tr>
              <th>Коли</th>
              <th>Матч</th>
              <th>Турнір</th>
              <th>Стан</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {список.map((m) => (
              <tr key={m.id}>
                <td data-label="Коли">{m.TimeOfMatch ? kyivDateTimeString(m.TimeOfMatch) : '—'}</td>
                <td className="strong">
                  {m._team1?.TeamName || '—'} <span className="muted">—</span> {m._team2?.TeamName || '—'}
                </td>
                <td className="muted" data-label="Турнір">
                  {[m._турнір, m._tour?.TourName].filter(Boolean).join(' · ')}
                </td>
                <td data-label="Стан">
                  {m._status?.Status || '—'}
                  {зПричиною(m.match_status_id) && m.status_note && <div className="muted small-text">{m.status_note}</div>}
                </td>
                <td className="row-actions">
                  <Link className="btn small primary" to={`/matches/${m.id}`}>
                    Відкрити матч
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
