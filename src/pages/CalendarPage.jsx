import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, PageHeader } from '../components/ui.jsx';
import TournamentMatches from './TournamentMatches.jsx';

/**
 * Календар: єдиний вхід до матчів.
 *
 * Досі матчі жили тільки всередині турніру (Сезони → сезон → турнір →
 * вкладка «Матчі»), тобто на третьому кліку й без жодної згадки в меню. Людина,
 * яка прийшла завести тур, їх просто не знаходила — а зі «Змагань» шляху до
 * матчів не було взагалі, бо змагання це довідник («Екстра-ліга» як поняття),
 * а матчі належать турніру сезону.
 *
 * Сам список і форма матчу тут ті самі, що у вкладці турніру: один компонент,
 * щоб правки не доводилось робити двічі.
 */
export default function CalendarPage() {
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => crm.get('/seasons') });
  const tournaments = useQuery({ queryKey: ['tournaments', 'all'], queryFn: () => crm.get('/tournaments') });

  const [season, setSeason] = useState('');
  const [tid, setTid] = useState('');

  // За замовчуванням — поточний сезон: у ньому заводять матчі щотижня,
  // а в архівні заходять раз на сезон.
  useEffect(() => {
    if (season || !seasons.data?.length) return;
    const поточний = seasons.data.find((s) => s.is_current) || seasons.data[0];
    setSeason(String(поточний.id));
  }, [seasons.data, season]);

  const свої = useMemo(
    () => (tournaments.data || []).filter((t) => String(t.season_id) === String(season)),
    [tournaments.data, season]
  );

  useEffect(() => {
    if (свої.length && !свої.some((t) => String(t.id) === String(tid))) setTid(String(свої[0].id));
    if (!свої.length) setTid('');
  }, [свої, tid]);

  const participants = useQuery({
    queryKey: ['participants', Number(tid)],
    queryFn: () => crm.get(`/tournaments/${tid}/participants`),
    enabled: !!tid,
  });

  const турнір = свої.find((t) => String(t.id) === String(tid));

  return (
    <div className="page">
      <PageHeader
        title="Календар"
        subtitle="Матчі турніру: створення, перенесення, протокол. Турнір обирається зверху — матч завжди належить конкретному турніру сезону"
      />
      <ErrorBox error={seasons.error || tournaments.error} />
      <div className="row2">
        <Field label="Сезон">
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            {(seasons.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Турнір">
          <select value={tid} onChange={(e) => setTid(e.target.value)} disabled={!свої.length}>
            {свої.map((t) => (
              <option key={t.id} value={t.id}>
                {t.League}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!свої.length && <Empty>У цьому сезоні ще немає турнірів — заведіть їх у розділі «Сезони»</Empty>}
      {турнір && <TournamentMatches tid={Number(tid)} participants={participants.data} />}
    </div>
  );
}
