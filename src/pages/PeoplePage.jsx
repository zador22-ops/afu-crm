import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, fmtDate, personName, toInt, useForm } from '../components/ui.jsx';

export default function PeoplePage() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const people = useQuery({
    queryKey: ['people', term],
    queryFn: () => crm.get('/people/search', { q: term, limit: 100 }),
    enabled: term.length >= 2,
  });

  return (
    <div className="page">
      <PageHeader
        title="Особи"
        subtitle="Гравці, тренери, адміністратори. Один запис на людину; клуб і роль задаються у складі або штабі клубу"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Нова особа
          </button>
        }
      />
      <div className="section-bar">
        <input className="search" placeholder="Прізвище, від двох літер" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <ErrorBox error={people.error} />
      {term.length < 2 && <Empty>Введіть початок прізвища</Empty>}
      {people.data?.length === 0 && <Empty>Нікого не знайдено</Empty>}
      {people.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Особа</th>
              <th>Дата народження</th>
              <th>Місто</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.data.map((p) => (
              <tr key={p.id}>
                <td className="club-cell">
                  {p.photo_url ? <img src={p.photo_url} alt="" className="avatar" /> : <span className="avatar placeholder" />}
                  <span className="strong">{personName(p)}</span>
                  <span className="muted small-text">#{p.id}</span>
                </td>
                <td>{fmtDate(p.Date_of_birth) || '—'}</td>
                <td className="muted">{p.City || '—'}</td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(p)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <PersonForm person={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function PersonForm({ person, onClose, onCreated }) {
  const qc = useQueryClient();
  const { values, set } = useForm({
    prizvushche: person.prizvushche || '',
    Name: person.Name || '',
    po_batkovi: person.po_batkovi || '',
    Date_of_birth: person.Date_of_birth || '',
    Growth: person.Growth ?? '',
    Weight: person.Weight ?? '',
    City: person.City || '',
  });
  const [photo, setPhoto] = useState(null);
  const save = useMutation({
    mutationFn: async () => {
      const data = {
        prizvushche: values.prizvushche.trim(),
        Name: values.Name.trim(),
        po_batkovi: values.po_batkovi.trim(),
        City: values.City.trim(),
        ...(values.Date_of_birth ? { Date_of_birth: values.Date_of_birth } : {}),
        ...(toInt(values.Growth) != null ? { Growth: toInt(values.Growth) } : {}),
        ...(toInt(values.Weight) != null ? { Weight: toInt(values.Weight) } : {}),
      };
      const saved = person.id ? await crm.patch(`/people/${person.id}`, data) : await crm.post('/people', data);
      if (photo) {
        const form = new FormData();
        form.append('image', photo);
        await crm.upload(`/people/${saved.id}/photo`, form);
      }
      return saved;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['people'] });
      qc.invalidateQueries({ queryKey: ['roster'] });
      qc.invalidateQueries({ queryKey: ['staff'] });
      onCreated?.(saved);
      onClose();
    },
  });
  return (
    <Modal title={person.id ? personName(person) : 'Нова особа'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="row3">
          <Field label="Прізвище">
            <input value={values.prizvushche} onChange={set('prizvushche')} required autoFocus />
          </Field>
          <Field label="Імʼя">
            <input value={values.Name} onChange={set('Name')} required />
          </Field>
          <Field label="По батькові">
            <input value={values.po_batkovi} onChange={set('po_batkovi')} />
          </Field>
        </div>
        <div className="row3">
          <Field label="Дата народження">
            <input type="date" value={values.Date_of_birth} onChange={set('Date_of_birth')} />
          </Field>
          <Field label="Зріст, см">
            <input type="number" value={values.Growth} onChange={set('Growth')} />
          </Field>
          <Field label="Вага, кг">
            <input type="number" value={values.Weight} onChange={set('Weight')} />
          </Field>
        </div>
        <Field label="Місто">
          <input value={values.City} onChange={set('City')} />
        </Field>
        <Field label="Фото">
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        </Field>
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={save.isPending}>
            Зберегти
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Пошук особи для вибору в складі чи штабі
export function PersonPicker({ value, onChange, onCreate }) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const people = useQuery({
    queryKey: ['people', term],
    queryFn: () => crm.get('/people/search', { q: term, limit: 30 }),
    enabled: term.length >= 2,
  });
  return (
    <div>
      <Field label="Особа" hint="Пошук за початком прізвища">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Прізвище" autoFocus />
      </Field>
      <div className="pick-list">
        {value && (
          <div className="pick selected static">
            <span>Обрано: {personName(value)}</span>
            <button type="button" className="btn small" onClick={() => onChange(null)}>
              Змінити
            </button>
          </div>
        )}
        {!value &&
          (people.data || []).map((p) => (
            <label key={p.id} className="pick">
              <input type="radio" name="person" onChange={() => onChange(p)} />
              {p.photo_url ? <img src={p.photo_url} alt="" className="avatar" /> : <span className="avatar placeholder" />}
              <span>{personName(p)}</span>
              <span className="muted">{fmtDate(p.Date_of_birth)}</span>
            </label>
          ))}
        {!value && term.length >= 2 && people.data?.length === 0 && (
          <div className="pick static">
            <span className="muted">Не знайдено</span>
            {onCreate && (
              <button type="button" className="btn small" onClick={onCreate}>
                Створити особу
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
