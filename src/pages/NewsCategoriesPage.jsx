import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle } from '../components/ui.jsx';
import { makeSlug, slugValid } from '../utils/slug.js';

// Рубрики новин: «Екстра-ліга», «Збірні», «АФУ». Адреса (slug) іде в посилання
// сайту, тож після публікації новин її краще не міняти.
export default function NewsCategoriesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['news-categories'], queryFn: () => crm.get('/news-categories') });
  const competitions = useQuery({ queryKey: ['competitions'], queryFn: () => crm.get('/competitions') });
  const [editing, setEditing] = useState(null);
  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/news-categories/${v.id}`, v.data) : crm.post('/news-categories', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['news-categories'] });
      setEditing(null);
    },
  });
  const змагання = Object.fromEntries((competitions.data || []).map((c) => [c.id, c.name]));

  return (
    <div className="page">
      <PageHeader
        back={
          <Link to="/news" className="back">
            ← Новини
          </Link>
        }
        title="Рубрики новин"
        subtitle="Меню новин на сайті. Прихована рубрика не показується в меню, а новини в ній — на сайті"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Нова рубрика
          </button>
        }
      />
      <ErrorBox error={list.error} />
      {list.data?.length === 0 && <Empty>Рубрик ще немає</Empty>}
      {list.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Рубрика</th>
              <th>Адреса</th>
              <th>Змагання</th>
              <th>Порядок</th>
              <th>Стан</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id} className={c.is_active ? '' : 'muted'}>
                <td className="strong">{c.name}</td>
                <td className="muted">{c.slug}</td>
                <td className="muted">{змагання[c.competition_id] || '—'}</td>
                <td>{c.sort_order}</td>
                <td>{c.is_active ? 'показується' : <span className="badge warn">прихована</span>}</td>
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
      {editing && (
        <CategoryForm item={editing} competitions={competitions.data || []} onClose={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
}

function CategoryForm({ item, competitions, onClose, onSave }) {
  const [v, setV] = useState({
    name: item.name || '',
    slug: item.slug || '',
    competition_id: item.competition_id || '',
    sort_order: item.sort_order ?? 0,
    is_active: item.is_active ?? true,
  });
  const [slugРучний, setSlugРучний] = useState(!!item.id);
  return (
    <Modal title={item.id ? item.name : 'Нова рубрика'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({
            id: item.id,
            data: {
              name: v.name.trim(),
              slug: v.slug.trim(),
              competition_id: v.competition_id ? Number(v.competition_id) : null,
              sort_order: Number(v.sort_order) || 0,
              is_active: v.is_active,
            },
          });
        }}
      >
        <Field label="Назва" hint="«Екстра-ліга», «Збірні», «АФУ»">
          <input
            value={v.name}
            onChange={(e) => {
              const name = e.target.value;
              setV((s) => ({ ...s, name, slug: slugРучний ? s.slug : makeSlug(name) }));
            }}
            required
            autoFocus
          />
        </Field>
        <Field label="Адреса" hint={`futsal.com.ua/novyny/${v.slug || '…'}/ — після публікації новин краще не міняти`}>
          <input
            value={v.slug}
            onChange={(e) => {
              setSlugРучний(true);
              setV((s) => ({ ...s, slug: e.target.value.toLowerCase() }));
            }}
            required
          />
          {v.slug && !slugValid(v.slug) && <div className="error-text">Лише малі латинські літери, цифри й дефіси між ними</div>}
        </Field>
        <div className="row2">
          <Field label="Змагання" hint="Необов'язково: зв'язок рубрики зі змаганням">
            <select value={v.competition_id} onChange={(e) => setV((s) => ({ ...s, competition_id: e.target.value }))}>
              <option value="">— без змагання —</option>
              {competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Порядок у меню">
            <input type="number" value={v.sort_order} onChange={(e) => setV((s) => ({ ...s, sort_order: e.target.value }))} />
          </Field>
        </div>
        <Toggle checked={v.is_active} onChange={(x) => setV((s) => ({ ...s, is_active: x }))} label="Показувати рубрику на сайті" />
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending || !slugValid(v.slug)}>
            Зберегти
          </button>
        </div>
      </form>
    </Modal>
  );
}
