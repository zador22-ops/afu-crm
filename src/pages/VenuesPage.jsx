import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, useForm } from '../components/ui.jsx';

/**
 * Арени. `Venues.City` — рядок «м. Бровари, БФСК», яким живуть ADMIN і
 * фанатський застосунок у картці матчу: його не чіпаємо й не розділяємо.
 * Окремі назва, місто, адреса, місткість і фото (рішення Андрія 29.09) — для
 * сайту; якщо назви немає, сайт показує рядок City.
 */
export default function VenuesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['venues'], queryFn: () => crm.get('/venues') });
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const save = useMutation({
    mutationFn: async (v) => {
      const saved = v.id ? await crm.patch(`/venues/${v.id}`, v.data) : await crm.post('/venues', v.data);
      if (v.photo) {
        const form = new FormData();
        form.append('image', v.photo);
        return crm.upload(`/venues/${saved.id}/photo`, form);
      }
      return saved;
    },
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
        subtitle="Місце проведення матчу. Рядок «місто, обʼєкт» бачать застосунок і ADMIN; окремі назва, місто, адреса, місткість і фото — для сайту"
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
              <th>Арена (застосунок і ADMIN)</th>
              <th>Для сайту</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="strong">{v.City}</td>
                <td className="muted small-text">
                  {[v.name, v.city, v.address, v.capacity ? `${v.capacity} місць` : null].filter(Boolean).join(' · ') || '—'}
                </td>
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
  const { values, set } = useForm({
    City: item.City || '',
    name: item.name || '',
    city: item.city || '',
    address: item.address || '',
    capacity: item.capacity ?? '',
  });
  const [photo, setPhoto] = useState(null);
  const [прев, setПрев] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    onSave.mutate({
      id: item.id,
      photo,
      data: {
        City: values.City.trim(),
        name: values.name.trim(),
        city: values.city.trim(),
        address: values.address.trim(),
        capacity: values.capacity === '' ? null : Number(values.capacity),
      },
    });
  };
  return (
    <Modal title={item.id ? item.City : 'Нова арена'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Рядок для застосунку й ADMIN" hint="Місто й обʼєкт одним рядком: «м. Бровари, БФСК». Так арену показують застосунок і ADMIN">
          <input value={values.City} onChange={set('City')} required autoFocus />
        </Field>
        <p className="muted small-text">Нижче — для сайту futsal.com.ua. Необовʼязково: без назви сайт покаже рядок вище.</p>
        <div className="row2">
          <Field label="Назва обʼєкта" hint="«БФСК», «ПС «Галичина»»">
            <input value={values.name} onChange={set('name')} />
          </Field>
          <Field label="Місто">
            <input value={values.city} onChange={set('city')} />
          </Field>
        </div>
        <div className="row2">
          <Field label="Адреса">
            <input value={values.address} onChange={set('address')} />
          </Field>
          <Field label="Місткість" hint="Глядацьких місць">
            <input type="number" min="0" value={values.capacity} onChange={set('capacity')} />
          </Field>
        </div>
        <Field label="Фото арени">
          <div className="club-cell">
            {(прев || item.photo?.url) && <img src={прев || item.photo.url} alt="" className="news-cover-prev" />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setPhoto(f);
                setПрев(f ? URL.createObjectURL(f) : null);
              }}
            />
          </div>
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
