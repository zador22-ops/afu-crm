import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle, useForm } from '../components/ui.jsx';

export default function SeasonPage() {
  const { id } = useParams();
  const seasonId = Number(id);
  const qc = useQueryClient();
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => crm.get('/seasons') });
  const competitions = useQuery({ queryKey: ['competitions'], queryFn: () => crm.get('/competitions') });
  const tournaments = useQuery({
    queryKey: ['tournaments', seasonId],
    queryFn: () => crm.get('/tournaments', { season_id: seasonId }),
  });
  const [editing, setEditing] = useState(null);
  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/tournaments/${v.id}`, v.data) : crm.post('/tournaments', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      setEditing(null);
    },
  });

  const season = seasons.data?.find((s) => s.id === seasonId);
  const compById = Object.fromEntries((competitions.data || []).map((c) => [c.id, c]));

  return (
    <div className="page">
      <PageHeader
        back={
          <Link to="/seasons" className="back">
            ← Сезони
          </Link>
        }
        title={season ? `Сезон ${season.name}` : 'Сезон'}
        subtitle="Турніри сезону. Кожен турнір — це рядок Leagues у Xano, той самий, що бачать ADMIN і фан-застосунок"
        actions={
          <button className="btn primary" onClick={() => setEditing({})} disabled={!competitions.data?.length}>
            Новий турнір
          </button>
        }
      />
      <ErrorBox error={tournaments.error || competitions.error} />
      {tournaments.data?.length === 0 && <Empty>У сезоні ще немає турнірів</Empty>}
      {tournaments.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Турнір</th>
              <th>Змагання</th>
              <th>Учасників</th>
              <th>У застосунку</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tournaments.data.map((t) => {
              const c = compById[t.league_id];
              return (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tournaments/${t.id}`} className="strong">
                      {t.League}
                    </Link>
                    {t.main && <span className="badge">головний</span>}
                    {t.Official_name && <div className="muted small-text">{t.Official_name}</div>}
                  </td>
                  <td>
                    {c ? <span className={`badge ${c.type === 'кубок' ? 'cup' : 'league'}`}>{c.name}</span> : <span className="muted">не вказано</span>}
                  </td>
                  <td>{t.participants_count}</td>
                  <td>{t.Relevance ? 'показується' : <span className="muted">прихований</span>}</td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => setEditing(t)}>
                      Редагувати
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing && (
        <TournamentForm item={editing} seasonId={seasonId} competitions={competitions.data || []} onClose={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
}

function TournamentForm({ item, seasonId, competitions, onClose, onSave }) {
  const { values, set } = useForm({
    League: item.League || '',
    Official_name: item.Official_name || '',
    Short_name: item.Short_name || '',
    league_id: item.league_id || competitions[0]?.id || '',
    Relevance: item.Relevance ?? true,
    main: !!item.main,
  });
  const submit = (e) => {
    e.preventDefault();
    onSave.mutate({
      id: item.id,
      data: {
        League: values.League.trim(),
        Official_name: values.Official_name.trim(),
        Short_name: values.Short_name.trim(),
        league_id: Number(values.league_id),
        season_id: seasonId,
        Relevance: values.Relevance,
        main: values.main,
      },
    });
  };
  return (
    <Modal title={item.id ? item.League : 'Новий турнір'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Назва, як показується" hint="«BETKING Екстра-ліга 2026/2027» — зі спонсором">
          <input value={values.League} onChange={set('League')} required autoFocus />
        </Field>
        <Field label="Офіційна назва">
          <input value={values.Official_name} onChange={set('Official_name')} />
        </Field>
        <div className="row2">
          <Field label="Коротка назва">
            <input value={values.Short_name} onChange={set('Short_name')} placeholder="Екстра-ліга" />
          </Field>
          <Field label="Змагання">
            <select value={values.league_id} onChange={set('league_id')} required>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Toggle checked={values.Relevance} onChange={set('Relevance')} label="Показувати у списках ADMIN і застосунку (Relevance)" />
        <Toggle checked={values.main} onChange={set('main')} label="Головний турнір: застосунок відкриває його за замовчуванням (main, рівно один)" />
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending}>
            Зберегти
          </button>
        </div>
      </form>
    </Modal>
  );
}
