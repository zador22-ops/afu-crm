import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, useForm } from '../components/ui.jsx';
import PhotoCropper from '../components/PhotoCropper.jsx';

// R20: суперники збірної та єврокубків. Це звичайні рядки TeamInfo з
// team_kind «збірна» або «іноземний клуб». Сервер сам тримає їх з
// Relevance = false і без турніру, тож серед клубів АФУ, у списках і пікерах
// ADMIN вони не з'являються. Складу й штабу в них немає: для цих матчів
// ведеться лише рахунок (варіант А, docs/proposals/international-competitions.md).
const ВИДИ = ['збірна', 'іноземний клуб'];

export default function OpponentsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const list = useQuery({ queryKey: ['clubs', 'opponents'], queryFn: () => crm.get('/clubs', { kind: 'opponents' }) });

  const save = useMutation({
    mutationFn: async (v) => {
      const saved = v.id ? await crm.patch(`/clubs/${v.id}`, v.data) : await crm.post('/clubs', v.data);
      if (v.logo) {
        const form = new FormData();
        form.append('kind', 'logo');
        form.append('image', v.logo);
        await crm.upload(`/clubs/${saved.id}/image`, form);
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clubs'] });
      setEditing(null);
    },
  });

  const видимі = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list.data || []).filter((c) => !s || c.TeamName.toLowerCase().includes(s) || (c.country || '').toLowerCase().includes(s));
  }, [list.data, q]);

  return (
    <div className="page">
      <PageHeader
        title="Суперники"
        subtitle="Збірні та іноземні клуби для матчів збірної і єврокубків. Серед клубів АФУ, у пошуку клубів і в ADMIN їх не видно; заявки й штабу в них немає, лише рахунок матчу"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Новий суперник
          </button>
        }
      />
      <div className="section-bar">
        <input className="search" placeholder="Пошук за назвою або країною" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorBox error={list.error} />
      {видимі.length === 0 && !list.isLoading && <Empty>Суперників ще немає</Empty>}
      {видимі.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Суперник</th>
              <th>Вид</th>
              <th>Країна</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {видимі.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="club-cell">
                    {c.TeamLogo?.url ? <img src={c.TeamLogo.url} alt="" className="logo-sm" /> : <span className="logo-sm logo-empty" />}
                    <span className="strong">{c.TeamName}</span>
                  </span>
                </td>
                <td>
                  <span className="badge intl">{c.team_kind}</span>
                </td>
                <td className="muted">{c.country || '—'}</td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(c)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <OpponentForm item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function OpponentForm({ item, onClose, onSave }) {
  const { values, set } = useForm({
    TeamName: item.TeamName || '',
    team_kind: item.team_kind || 'збірна',
    country: item.country || '',
  });
  const [logo, setLogo] = useState(null);
  const чинний = item.TeamLogo?.url || null;
  const [прев, setПрев] = useState(null);
  const [кадруємо, setКадруємо] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    onSave.mutate({
      id: item.id,
      logo,
      data: { TeamName: values.TeamName.trim(), team_kind: values.team_kind, country: values.country.trim() },
    });
  };

  return (
    <Modal title={item.id ? item.TeamName : 'Новий суперник'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Назва" hint="Як показувати в матчі: «Іспанія», «Барселона»">
          <input value={values.TeamName} onChange={set('TeamName')} required autoFocus />
        </Field>
        <div className="row2">
          <Field label="Вид">
            <select value={values.team_kind} onChange={set('team_kind')}>
              {ВИДИ.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Країна">
            <input value={values.country} onChange={set('country')} required />
          </Field>
        </div>
        <Field label="Логотип" hint="Прапор або емблема федерації для збірної, емблема клубу для іноземного клубу">
          <div className="club-cell">
            {(прев || чинний) && <img src={прев || чинний} alt="" className="img-logo small" />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setLogo(f);
                setПрев(f ? URL.createObjectURL(f) : null);
              }}
            />
            <button type="button" className="btn small" disabled={!logo && !чинний} onClick={() => setКадруємо(true)}>
              Кадрувати
            </button>
          </div>
        </Field>
        {кадруємо && (
          <PhotoCropper
            file={logo}
            url={!logo ? чинний : undefined}
            прозоро
            size={256}
            onClose={() => setКадруємо(false)}
            onDone={(blob, urlПрев) => {
              setLogo(new File([blob], 'logo.png', { type: 'image/png' }));
              setПрев(urlПрев);
              setКадруємо(false);
            }}
          />
        )}
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <span className="spacer" />
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
