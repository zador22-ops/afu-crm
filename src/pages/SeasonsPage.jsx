import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle, fmtDate, useForm } from '../components/ui.jsx';

export default function SeasonsPage() {
  const qc = useQueryClient();
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => crm.get('/seasons') });
  const tournaments = useQuery({ queryKey: ['tournaments', 'all'], queryFn: () => crm.get('/tournaments') });
  const [editing, setEditing] = useState(null); // null | {} (новий) | season

  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/seasons/${v.id}`, v.data) : crm.post('/seasons', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['seasons'] });
      setEditing(null);
    },
  });

  const countBySeason = {};
  for (const t of tournaments.data || []) countBySeason[t.season_id] = (countBySeason[t.season_id] || 0) + 1;

  return (
    <div className="page">
      <PageHeader
        title="Сезони"
        subtitle="Сезон обʼєднує турніри: Екстра-лігу, Першу лігу, Кубок"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Новий сезон
          </button>
        }
      />
      <ErrorBox error={seasons.error} />
      {seasons.data?.length === 0 && <Empty>Сезонів ще немає</Empty>}
      {seasons.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Сезон</th>
              <th>Період</th>
              <th>Турнірів</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {seasons.data.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/seasons/${s.id}`} className="strong">
                    {s.name}
                  </Link>
                  {s.is_current && <span className="badge brand">поточний</span>}
                </td>
                <td className="muted">
                  {s.start_date || s.end_date ? `${fmtDate(s.start_date)} – ${fmtDate(s.end_date)}` : '—'}
                </td>
                <td>{countBySeason[s.id] || 0}</td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(s)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <SeasonForm season={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function SeasonForm({ season, onClose, onSave }) {
  const { values, set } = useForm({
    name: season.name || '',
    start_date: season.start_date || '',
    end_date: season.end_date || '',
    is_current: !!season.is_current,
  });
  const submit = (e) => {
    e.preventDefault();
    const data = {
      name: values.name.trim(),
      is_current: values.is_current,
      ...(values.start_date ? { start_date: values.start_date } : {}),
      ...(values.end_date ? { end_date: values.end_date } : {}),
    };
    onSave.mutate({ id: season.id, data });
  };
  return (
    <Modal title={season.id ? `Сезон ${season.name}` : 'Новий сезон'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Назва" hint="Наприклад «2026/27»">
          <input value={values.name} onChange={set('name')} required autoFocus />
        </Field>
        <div className="row2">
          <Field label="Початок">
            <input type="date" value={values.start_date} onChange={set('start_date')} />
          </Field>
          <Field label="Кінець">
            <input type="date" value={values.end_date} onChange={set('end_date')} />
          </Field>
        </div>
        <Toggle checked={values.is_current} onChange={set('is_current')} label="Поточний сезон (знімає ознаку з решти)" />
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
