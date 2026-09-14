import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, useForm } from '../components/ui.jsx';

export default function CompetitionsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['competitions'], queryFn: () => crm.get('/competitions') });
  const [editing, setEditing] = useState(null);
  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/competitions/${v.id}`, v.data) : crm.post('/competitions', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitions'] });
      setEditing(null);
    },
  });

  return (
    <div className="page">
      <PageHeader
        title="Змагання"
        subtitle="Ліга має таблицю і, за потреби, плей-оф; кубок — лише сітку. Турнір сезону посилається на змагання"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Нове змагання
          </button>
        }
      />
      <ErrorBox error={list.error} />
      {list.data?.length === 0 && <Empty>Змагань ще немає</Empty>}
      {list.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Назва</th>
              <th>Коротка</th>
              <th>Тип</th>
              <th>Порядок</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id}>
                <td className="strong">{c.name}</td>
                <td className="muted">{c.short_name || '—'}</td>
                <td>
                  <span className={`badge ${c.type === 'кубок' ? 'cup' : 'league'}`}>{c.type || '—'}</span>
                </td>
                <td>{c.sort_order}</td>
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
      {editing && <CompetitionForm item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function CompetitionForm({ item, onClose, onSave }) {
  const { values, set } = useForm({
    name: item.name || '',
    type: item.type || 'ліга',
    short_name: item.short_name || '',
    sort_order: item.sort_order ?? 0,
  });
  const submit = (e) => {
    e.preventDefault();
    onSave.mutate({
      id: item.id,
      data: { name: values.name.trim(), type: values.type, short_name: values.short_name.trim(), sort_order: Number(values.sort_order) || 0 },
    });
  };
  return (
    <Modal title={item.id ? item.name : 'Нове змагання'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Назва" hint="«Екстра-ліга», «Перша ліга», «Кубок України»">
          <input value={values.name} onChange={set('name')} required autoFocus />
        </Field>
        <div className="row2">
          <Field label="Тип">
            <select value={values.type} onChange={set('type')}>
              <option value="ліга">ліга</option>
              <option value="кубок">кубок</option>
            </select>
          </Field>
          <Field label="Порядок у списках">
            <input type="number" value={values.sort_order} onChange={set('sort_order')} />
          </Field>
        </div>
        <Field label="Коротка назва">
          <input value={values.short_name} onChange={set('short_name')} />
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
