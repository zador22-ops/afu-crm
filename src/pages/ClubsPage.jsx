import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle, useForm } from '../components/ui.jsx';

export default function ClubsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const clubs = useQuery({ queryKey: ['clubs', archived], queryFn: () => crm.get('/clubs', { archived }) });
  const create = useMutation({
    mutationFn: (body) => crm.post('/clubs', body),
    onSuccess: (club) => {
      qc.invalidateQueries({ queryKey: ['clubs'] });
      setCreating(false);
      nav(`/clubs/${club.id}`);
    },
  });

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (clubs.data || []).filter((c) => !s || c.TeamName.toLowerCase().includes(s) || (c.TeamInfo || '').toLowerCase().includes(s));
  }, [clubs.data, q]);

  return (
    <div className="page">
      <PageHeader
        title="Клуби"
        subtitle="Один запис на клуб на всі сезони. Участь у турнірах — на сторінці турніру або у картці клубу"
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            Новий клуб
          </button>
        }
      />
      <div className="section-bar">
        <input className="search" placeholder="Пошук за назвою або містом" value={q} onChange={(e) => setQ(e.target.value)} />
        <Toggle checked={archived} onChange={setArchived} label="Показати й архівні" />
      </div>
      <ErrorBox error={clubs.error} />
      {list.length === 0 && !clubs.isLoading && <Empty>Клубів не знайдено</Empty>}
      {list.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Клуб</th>
              <th>Місто</th>
              <th>Головний турнір</th>
              <th>Стан</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/clubs/${c.id}`} className="club-cell">
                    {c.TeamLogo?.url && <img src={c.TeamLogo.url} alt="" className="logo-sm" />}
                    <span className="strong">{c.TeamName}</span>
                  </Link>
                </td>
                <td className="muted">{c.TeamInfo}</td>
                <td>{c._leagues?.League || <span className="muted">—</span>}</td>
                <td>{c.Relevance ? 'активний' : <span className="badge warn">архів</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <NewClub onClose={() => setCreating(false)} onCreate={create} />}
    </div>
  );
}

function NewClub({ onClose, onCreate }) {
  const { values, set } = useForm({ TeamName: '', TeamInfo: '' });
  return (
    <Modal title="Новий клуб" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate.mutate({ TeamName: values.TeamName.trim(), TeamInfo: values.TeamInfo.trim(), Relevance: true });
        }}
      >
        <Field label="Назва">
          <input value={values.TeamName} onChange={set('TeamName')} required autoFocus />
        </Field>
        <Field label="Місто">
          <input value={values.TeamInfo} onChange={set('TeamInfo')} />
        </Field>
        <p className="muted small-text">Решту довідки, логотип і склад заповните в картці клубу після створення.</p>
        <ErrorBox error={onCreate.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onCreate.isPending}>
            Створити
          </button>
        </div>
      </form>
    </Modal>
  );
}
