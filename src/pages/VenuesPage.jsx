import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, useForm } from '../components/ui.jsx';

/**
 * Арени. Одне поле `Venues.City`, у якому живуть і місто, і об'єкт одним рядком
 * («м. Бровари, БФСК»). Розділяти його не можна: у такому вигляді арену показує
 * фанатський застосунок у картці матчу, і на нього ж дивиться ADMIN.
 */
export default function VenuesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['venues'], queryFn: () => crm.get('/venues') });
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/venues/${v.id}`, v.data) : crm.post('/venues', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venues'] });
      // Довідник арен читає ще й форма матчу — щоб нова арена з'явилась там одразу
      qc.invalidateQueries({ queryKey: ['dicts'] });
      setEditing(null);
    },
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = list.data || [];
    return s ? all.filter((v) => String(v.City || '').toLowerCase().includes(s)) : all;
  }, [list.data, q]);

  return (
    <div className="page">
      <PageHeader
        title="Арени"
        subtitle="Місце проведення матчу. Місто й обʼєкт пишуться одним рядком — так само, як їх показує застосунок"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Нова арена
          </button>
        }
      />
      <ErrorBox error={list.error} />
      <div className="section-bar">
        <input className="search" placeholder="Пошук за назвою або містом" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.data && rows.length === 0 && <Empty>{q ? 'Нічого не знайшлось' : 'Арен ще немає'}</Empty>}
      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Арена</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="strong">{v.City}</td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(v)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <VenueForm item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function VenueForm({ item, onClose, onSave }) {
  const { values, set } = useForm({ City: item.City || '' });
  const submit = (e) => {
    e.preventDefault();
    onSave.mutate({ id: item.id, data: { City: values.City.trim() } });
  };
  return (
    <Modal title={item.id ? item.City : 'Нова арена'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Назва" hint="Місто й обʼєкт одним рядком: «м. Бровари, БФСК», «м. Львів, ПС «Галичина»»">
          <input value={values.City} onChange={set('City')} required autoFocus />
        </Field>
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
