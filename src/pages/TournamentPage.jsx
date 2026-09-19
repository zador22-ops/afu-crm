import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Tabs, Toggle, useForm } from '../components/ui.jsx';
import TournamentMatches from './TournamentMatches.jsx';
import TournamentBracket from './TournamentBracket.jsx';
import TournamentZones from './TournamentZones.jsx';

const ЕТАПИ = { 1: 'Основна таблиця', 2: 'Плей-оф / сітка' };

export default function TournamentPage() {
  const { id } = useParams();
  const tid = Number(id);
  const [tab, setTab] = useState('participants');

  const tournaments = useQuery({ queryKey: ['tournaments', 'all'], queryFn: () => crm.get('/tournaments') });
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => crm.get('/seasons') });
  const participants = useQuery({ queryKey: ['participants', tid], queryFn: () => crm.get(`/tournaments/${tid}/participants`) });
  const tours = useQuery({ queryKey: ['tours', tid], queryFn: () => crm.get(`/tournaments/${tid}/tours`) });
  const matches = useQuery({ queryKey: ['matches', tid, ''], queryFn: () => crm.get('/matches', { leagues_id: tid }) });

  const t = tournaments.data?.find((x) => x.id === tid);
  const season = seasons.data?.find((s) => s.id === t?.season_id);

  return (
    <div className="page">
      <PageHeader
        back={
          <Link to={t?.season_id ? `/seasons/${t.season_id}` : '/seasons'} className="back">
            ← {season ? `Сезон ${season.name}` : 'Сезони'}
          </Link>
        }
        title={t?.League || 'Турнір'}
        subtitle={t?.Official_name}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'participants', label: 'Учасники', count: participants.data?.length },
          { key: 'tours', label: 'Тури', count: tours.data?.length },
          { key: 'matches', label: 'Матчі', count: matches.data?.length },
          { key: 'bracket', label: 'Сітка' },
          { key: 'zones', label: 'Зони' },
        ]}
      />
      {tab === 'participants' && <Participants tid={tid} query={participants} />}
      {tab === 'tours' && <Tours tid={tid} query={tours} />}
      {tab === 'matches' && <TournamentMatches tid={tid} participants={participants.data} />}
      {tab === 'bracket' && <TournamentBracket tid={tid} participants={participants.data} />}
      {tab === 'zones' && <TournamentZones tid={tid} />}
    </div>
  );
}

function Participants({ tid, query }) {
  const qc = useQueryClient();
  const clubs = useQuery({ queryKey: ['clubs', false], queryFn: () => crm.get('/clubs') });
  const [adding, setAdding] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['participants', tid] });
    qc.invalidateQueries({ queryKey: ['tournaments'] });
    qc.invalidateQueries({ queryKey: ['clubs'] });
  };
  const add = useMutation({
    mutationFn: (body) => crm.post(`/tournaments/${tid}/participants`, body),
    onSuccess: () => {
      invalidate();
      setAdding(false);
    },
  });
  const remove = useMutation({
    mutationFn: (teaminfo_id) => crm.del(`/tournaments/${tid}/participants/${teaminfo_id}`),
    onSuccess: invalidate,
  });

  const inTournament = new Set((query.data || []).map((p) => p.teaminfo_id));
  const candidates = (clubs.data || []).filter((c) => !inTournament.has(c.id));

  return (
    <section>
      <div className="section-bar">
        <span className="muted">Клуби, заявлені в турнір. Джерело правди — таблиця учасників; поле «турнір» у клубі оновлюється як дзеркало для ADMIN</span>
        <button className="btn primary" onClick={() => setAdding(true)}>
          Додати клуб
        </button>
      </div>
      <ErrorBox error={query.error || remove.error} />
      {query.data?.length === 0 && <Empty>Учасників ще немає</Empty>}
      {query.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Клуб</th>
              <th>Місто</th>
              <th>Головний турнір клубу</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((p) => (
              <tr key={p.id} className={p.withdrawn ? 'muted' : ''}>
                <td>
                  <Link to={`/clubs/${p.teaminfo_id}`} className="club-cell">
                    {p._club?.TeamLogo?.url && <img src={p._club.TeamLogo.url} alt="" className="logo-sm" />}
                    <span className="strong">{p._club?.TeamName || `#${p.teaminfo_id}`}</span>
                  </Link>
                  {p.withdrawn && <span className="badge warn">знявся</span>}
                </td>
                <td className="muted">{p._club?.TeamInfo}</td>
                <td>{p._club?.leagues_id === tid ? 'цей' : <span className="muted">інший (#{p._club?.leagues_id})</span>}</td>
                <td className="row-actions">
                  <button
                    className="btn small danger"
                    onClick={() => window.confirm(`Прибрати ${p._club?.TeamName} з учасників?`) && remove.mutate(p.teaminfo_id)}
                  >
                    Прибрати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <AddParticipant candidates={candidates} onClose={() => setAdding(false)} onAdd={add} />}
    </section>
  );
}

function AddParticipant({ candidates, onClose, onAdd }) {
  const [q, setQ] = useState('');
  const [teaminfo_id, setId] = useState('');
  const [set_main, setMain] = useState(true);
  const list = useMemo(() => candidates.filter((c) => c.TeamName.toLowerCase().includes(q.toLowerCase())), [candidates, q]);
  return (
    <Modal title="Додати клуб у турнір" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd.mutate({ teaminfo_id: Number(teaminfo_id), set_main });
        }}
      >
        <Field label="Пошук клубу">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Почніть вводити назву" autoFocus />
        </Field>
        <div className="pick-list">
          {list.map((c) => (
            <label key={c.id} className={`pick ${String(c.id) === String(teaminfo_id) ? 'selected' : ''}`}>
              <input type="radio" name="club" value={c.id} checked={String(c.id) === String(teaminfo_id)} onChange={() => setId(c.id)} />
              {c.TeamLogo?.url && <img src={c.TeamLogo.url} alt="" className="logo-sm" />}
              <span>{c.TeamName}</span>
              <span className="muted">{c.TeamInfo}</span>
            </label>
          ))}
          {list.length === 0 && <Empty>Нічого не знайдено. Новий клуб створюється на сторінці «Клуби»</Empty>}
        </div>
        <Toggle checked={set_main} onChange={setMain} label="Зробити цей турнір головним для клубу (те, що бачить ADMIN і фан-застосунок)" />
        <ErrorBox error={onAdd.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={!teaminfo_id || onAdd.isPending}>
            Додати
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Tours({ tid, query }) {
  const qc = useQueryClient();
  const [gen, setGen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tours', tid] });
  const generate = useMutation({
    mutationFn: (body) => crm.post(`/tournaments/${tid}/tours/generate`, body),
    onSuccess: () => {
      invalidate();
      setGen(false);
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, TourName }) => crm.patch(`/tours/${id}`, { TourName }),
    onSuccess: () => {
      invalidate();
      setRenaming(null);
    },
  });
  const remove = useMutation({ mutationFn: (id) => crm.del(`/tours/${id}`), onSuccess: invalidate });

  const byStage = { 1: [], 2: [] };
  for (const t of query.data || []) (byStage[t.league_stage_id] ??= []).push(t);

  return (
    <section>
      <div className="section-bar">
        <span className="muted">Етап 1 — тури таблиці, етап 2 — раунди сітки. Тур із матчами видалити не можна</span>
        <button className="btn primary" onClick={() => setGen(true)}>
          Створити тури
        </button>
      </div>
      <ErrorBox error={query.error || remove.error} />
      {query.data?.length === 0 && <Empty>Турів ще немає</Empty>}
      {Object.entries(byStage).map(([stage, list]) =>
        list.length ? (
          <div key={stage} className="stage-block">
            <h3>{ЕТАПИ[stage] || `Етап ${stage}`}</h3>
            <table className="table compact">
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {renaming?.id === t.id ? (
                        <form
                          className="inline-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            rename.mutate({ id: t.id, TourName: renaming.value.trim() });
                          }}
                        >
                          <input autoFocus value={renaming.value} onChange={(e) => setRenaming({ id: t.id, value: e.target.value })} />
                          <button className="btn small primary">OK</button>
                          <button type="button" className="btn small" onClick={() => setRenaming(null)}>
                            Скасувати
                          </button>
                        </form>
                      ) : (
                        <span className="strong">{t.TourName}</span>
                      )}
                    </td>
                    <td className="muted">{t.matches_count ? `${t.matches_count} матчів` : 'без матчів'}</td>
                    <td className="row-actions">
                      <button className="btn small" onClick={() => setRenaming({ id: t.id, value: t.TourName })}>
                        Перейменувати
                      </button>
                      <button
                        className="btn small danger"
                        disabled={t.matches_count > 0}
                        onClick={() => window.confirm(`Видалити тур «${t.TourName}»?`) && remove.mutate(t.id)}
                      >
                        Видалити
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null
      )}
      {gen && <GenerateTours onClose={() => setGen(false)} onGenerate={generate} />}
    </section>
  );
}

function GenerateTours({ onClose, onGenerate }) {
  const { values, set } = useForm({ league_stage_id: '1', count: 18, names: '1/4 фіналу\n1/2 фіналу\nМатч за 3 місце\nФінал' });
  const isTable = values.league_stage_id === '1';
  const submit = (e) => {
    e.preventDefault();
    const body = { league_stage_id: Number(values.league_stage_id) };
    if (isTable) body.count = Number(values.count) || 0;
    else body.names = values.names.split('\n').map((s) => s.trim()).filter(Boolean);
    onGenerate.mutate(body);
  };
  return (
    <Modal title="Створити тури" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Етап">
          <select value={values.league_stage_id} onChange={set('league_stage_id')}>
            <option value="1">Основна таблиця — «1-й тур … N-й тур»</option>
            <option value="2">Плей-оф / сітка — раунди за назвами</option>
          </select>
        </Field>
        {isTable ? (
          <Field label="Кількість турів" hint="Наявні назви пропускаються, дублів не буде">
            <input type="number" min="1" max="60" value={values.count} onChange={set('count')} />
          </Field>
        ) : (
          <Field label="Назви раундів, по одній у рядку">
            <textarea rows={5} value={values.names} onChange={set('names')} />
          </Field>
        )}
        <ErrorBox error={onGenerate.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onGenerate.isPending}>
            Створити
          </button>
        </div>
      </form>
    </Modal>
  );
}
