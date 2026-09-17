import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle, fmtDate, useForm } from '../components/ui.jsx';
import PhotoCropper from '../components/PhotoCropper.jsx';

/**
 * Судді (таблиця `Judges`, 104 записи). Окремі від «Осіб»: у Xano це різні
 * таблиці, і матч посилається саме на `Judges` трьома полями (referee1..3).
 *
 * Колонка фото тут називається `photo` з малої літери — на відміну від
 * `People.Photo`. Різнобій у базі, не в нас.
 *
 * Список невеликий і повний, тож пошук фільтрує вже завантажене — на відміну
 * від «Осіб», де людей тисячі й пошук іде запитом.
 */
const судде = (j) => [j?.prizvushche, j?.Name, j?.po_batkovi].filter(Boolean).join(' ');

export default function JudgesPage() {
  const qc = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const list = useQuery({
    queryKey: ['judges', archived],
    queryFn: () => crm.get('/judges', { archived: archived || undefined }),
  });

  const save = useMutation({
    mutationFn: async (v) => {
      const saved = v.id ? await crm.patch(`/judges/${v.id}`, v.data) : await crm.post('/judges', v.data);
      if (v.photo) {
        const form = new FormData();
        form.append('image', v.photo);
        await crm.upload(`/judges/${saved.id}/photo`, form);
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['judges'] });
      setEditing(null);
    },
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = list.data || [];
    return s ? all.filter((j) => судде(j).toLowerCase().includes(s) || String(j.City || '').toLowerCase().includes(s)) : all;
  }, [list.data, q]);

  return (
    <div className="page">
      <PageHeader
        title="Судді"
        subtitle="Арбітри матчів. Окремий довідник від «Осіб»: матч посилається саме сюди трьома полями"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Новий суддя
          </button>
        }
      />
      <div className="section-bar">
        <input className="search" placeholder="Пошук за прізвищем або містом" value={q} onChange={(e) => setQ(e.target.value)} />
        <Toggle checked={archived} onChange={setArchived} label="Показати й архівних" />
      </div>
      <ErrorBox error={list.error} />
      {list.data && rows.length === 0 && <Empty>{q ? 'Нікого не знайдено' : 'Суддів ще немає'}</Empty>}
      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Суддя</th>
              <th>Дата народження</th>
              <th>Місто</th>
              <th>Стан</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id}>
                <td className="club-cell">
                  {j.photo?.url ? <img src={j.photo.url} alt="" className="avatar" /> : <span className="avatar placeholder" />}
                  <span className="strong">{судде(j)}</span>
                  <span className="muted small-text">#{j.id}</span>
                </td>
                <td>{fmtDate(j.Date_of_birth) || '—'}</td>
                <td className="muted">{j.City || '—'}</td>
                <td>{j.Relevance ? 'активний' : <span className="badge warn">архів</span>}</td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(j)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <JudgeForm item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function JudgeForm({ item, onClose, onSave }) {
  const { values, set } = useForm({
    prizvushche: item.prizvushche || '',
    Name: item.Name || '',
    po_batkovi: item.po_batkovi || '',
    Date_of_birth: item.Date_of_birth || '',
    City: item.City || '',
    Relevance: item.id ? !!item.Relevance : true,
  });
  const [photo, setPhoto] = useState(null);
  const чинне = item.photo?.url || null;
  const [прев, setПрев] = useState(null);
  const [кадруємо, setКадруємо] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const data = {
      prizvushche: values.prizvushche.trim(),
      Name: values.Name.trim(),
      po_batkovi: values.po_batkovi.trim(),
      City: values.City.trim(),
    };
    // Порожню дату не шлемо зовсім: PATCH пише лише ті ключі, що прийшли,
    // і порожній рядок затер би наявну дату народження.
    if (values.Date_of_birth) data.Date_of_birth = values.Date_of_birth;
    if (item.id) data.Relevance = values.Relevance;
    onSave.mutate({ id: item.id, photo, data });
  };
  return (
    <Modal title={item.id ? судде(item) : 'Новий суддя'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Прізвище">
          <input value={values.prizvushche} onChange={set('prizvushche')} required autoFocus />
        </Field>
        <div className="row2">
          <Field label="Імʼя">
            <input value={values.Name} onChange={set('Name')} required />
          </Field>
          <Field label="По батькові">
            <input value={values.po_batkovi} onChange={set('po_batkovi')} />
          </Field>
        </div>
        <div className="row2">
          <Field label="Дата народження">
            <input type="date" value={values.Date_of_birth} onChange={set('Date_of_birth')} />
          </Field>
          <Field label="Місто">
            <input value={values.City} onChange={set('City')} />
          </Field>
        </div>
        <Field label="Фото" hint="Зберігається квадратом: у застосунку аватар круглий. Арбітр поки показується літерою, фото заливається наперед">
          <div className="club-cell">
            {(прев || чинне) && <img src={прев || чинне} alt="" className="avatar-lg" />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setPhoto(f);
                setПрев(f ? URL.createObjectURL(f) : null);
              }}
            />
            <button type="button" className="btn small" disabled={!photo && !чинне} onClick={() => setКадруємо(true)}>
              Кадрувати
            </button>
          </div>
        </Field>
        {кадруємо && (
          <PhotoCropper
            file={photo}
            url={!photo ? чинне : undefined}
            onClose={() => setКадруємо(false)}
            onDone={(blob, urlПрев) => {
              setPhoto(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
              setПрев(urlПрев);
              setКадруємо(false);
            }}
          />
        )}
        {item.id && (
          <Toggle checked={values.Relevance} onChange={set('Relevance')} label="Активний (в архіві не пропонується при призначенні на матч)" />
        )}
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
