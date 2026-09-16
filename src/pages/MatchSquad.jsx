import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Toggle, personName } from '../components/ui.jsx';

/**
 * Заявка на матч: хто з клубу вийшов на цю гру і хто з штабу був на лаві.
 *
 * Зберігається ЦІЛКОМ на команду: сервер зносить старі рядки й пише нові —
 * так само, як ADMIN (#133). Тому кнопка одна, «Зберегти заявку», а не
 * додавання по одному: два джерела правди на одну заявку гірші за зайвий клік.
 *
 * Рядок заявки посилається на `Team.id` — рядок складу, а не на гравця. Через
 * це той самий гравець у споріднених клубах («СкайАп» і «СкайАп-2») має різні
 * рядки, і його статистика не змішується.
 */
export default function MatchSquad({ match }) {
  const [side, setSide] = useState(match.team1_id);
  const клуб = side === match.team1_id ? match._team1 : match._team2;
  return (
    <section>
      <div className="section-bar">
        <div className="tabs">
          <button className={side === match.team1_id ? 'tab active' : 'tab'} onClick={() => setSide(match.team1_id)}>
            {match._team1?.TeamName}
          </button>
          <button className={side === match.team2_id ? 'tab active' : 'tab'} onClick={() => setSide(match.team2_id)}>
            {match._team2?.TeamName}
          </button>
        </div>
        <span className="muted">Заявка зберігається цілком на команду. Стартова пʼятірка — не більше пʼятьох</span>
      </div>
      <SquadEditor key={side} matchId={match.id} teaminfoId={side} назва={клуб?.TeamName} />
    </section>
  );
}

function SquadEditor({ matchId, teaminfoId, назва }) {
  const qc = useQueryClient();
  const roster = useQuery({ queryKey: ['roster', teaminfoId], queryFn: () => crm.get(`/clubs/${teaminfoId}/roster`) });
  const staff = useQuery({ queryKey: ['staff', teaminfoId], queryFn: () => crm.get(`/clubs/${teaminfoId}/staff`) });
  const squad = useQuery({
    queryKey: ['squad', matchId, teaminfoId],
    queryFn: () => crm.get(`/matches/${matchId}/squad`, { teaminfo_id: teaminfoId }),
  });

  const [обрані, setОбрані] = useState({});
  const [штаб, setШтаб] = useState({});

  // Заявку з сервера розкладаємо у два словники: «заявлений» і «у старті».
  useEffect(() => {
    if (!squad.data) return;
    const p = {};
    for (const row of squad.data.players || []) p[row.team_id] = row.First5 ? 'first5' : 'yes';
    const s = {};
    for (const row of squad.data.staff || []) s[row.administration_of_teams_id] = true;
    setОбрані(p);
    setШтаб(s);
  }, [squad.data]);

  const save = useMutation({
    mutationFn: () =>
      crm.put(`/matches/${matchId}/squad`, {
        teaminfo_id: teaminfoId,
        players: Object.entries(обрані)
          .filter(([, v]) => v)
          .map(([id, v]) => ({ team_id: Number(id), first5: v === 'first5' })),
        staff: Object.entries(штаб)
          .filter(([, v]) => v)
          .map(([id]) => Number(id)),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['squad', matchId, teaminfoId] }),
  });

  const активні = useMemo(() => (roster.data || []).filter((r) => r.Relevance_of_the_record), [roster.data]);
  const уСтарті = Object.values(обрані).filter((v) => v === 'first5').length;
  const заявлено = Object.values(обрані).filter(Boolean).length;

  const перемкнути = (id, стан) => setОбрані((s) => ({ ...s, [id]: s[id] === стан ? undefined : стан }));

  if (roster.isPending || squad.isPending) return <div className="muted">Завантаження…</div>;

  return (
    <div>
      <ErrorBox error={roster.error || squad.error || save.error} />
      <div className="section-bar">
        <span className="muted">
          {назва}: заявлено {заявлено}, у старті {уСтарті}
        </span>
        <button className="btn primary" onClick={() => save.mutate()} disabled={save.isPending}>
          Зберегти заявку
        </button>
        {save.isSuccess && <span className="muted small-text">збережено</span>}
      </div>
      {активні.length === 0 && <Empty>У клубі немає чинного складу</Empty>}
      {активні.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>№</th>
              <th>Гравець</th>
              <th>Заявлений</th>
              <th>Стартова пʼятірка</th>
            </tr>
          </thead>
          <tbody>
            {активні.map((r) => (
              <tr key={r.id}>
                <td className="muted">{r.Number || '—'}</td>
                <td className="strong">
                  {personName(r._people) || `гравець ${r.player_id}`}
                  {r.Captain && <span className="badge">капітан</span>}
                </td>
                <td>
                  <Toggle checked={!!обрані[r.id]} onChange={() => перемкнути(r.id, 'yes')} label="" />
                </td>
                <td>
                  <Toggle
                    checked={обрані[r.id] === 'first5'}
                    onChange={() => перемкнути(r.id, 'first5')}
                    label=""
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4>Штаб на лаві</h4>
      {(staff.data || []).length === 0 && <Empty>Штаб клубу порожній</Empty>}
      {(staff.data || []).length > 0 && (
        <table className="table compact">
          <tbody>
            {(staff.data || [])
              .filter((s) => s.Relevance_of_the_record !== false)
              .map((s) => (
                <tr key={s.id}>
                  <td>{personName(s._people) || `особа ${s.people_id}`}</td>
                  <td className="muted">{s._positions?.Position || ''}</td>
                  <td>
                    <Toggle checked={!!штаб[s.id]} onChange={(v) => setШтаб((x) => ({ ...x, [s.id]: v }))} label="" />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
