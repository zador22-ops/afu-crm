import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle } from '../components/ui.jsx';
import { makeSlug, slugValid } from '../utils/slug.js';

// Органи управління АФУ (afu-crm#6): Президія, Виконавчий комітет, комітети,
// Виконавча дирекція — і склад кожного. У складі лише ім'я, прізвище, посада
// і фото; контакт — службова пошта органу. «Прибрати зі складу» ховає людину
// (is_active = false), а не видаляє: її можна повернути.
const ВИДИ = {
  presidium: 'Президія',
  executive_committee: 'Виконавчий комітет',
  committee: 'Комітет',
  directorate: 'Виконавча дирекція',
};

export default function GoverningBodiesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['governing-bodies'], queryFn: () => crm.get('/governing-bodies') });
  const [editing, setEditing] = useState(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['governing-bodies'] });
  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/governing-bodies/${v.id}`, v.data) : crm.post('/governing-bodies', v.data)),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const reorder = useMutation({ mutationFn: (ids) => crm.post('/governing-bodies/reorder', { ids }), onSuccess: invalidate });
  const bodies = list.data || [];
  const move = (i, d) => {
    const ids = bodies.map((b) => b.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <div className="page">
      <PageHeader
        title="Органи управління"
        subtitle="Розділ «АФУ» сайту futsal.com.ua. Показуються органи й люди, які не приховані, у порядку цього списку"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Новий орган
          </button>
        }
      />
      <ErrorBox error={list.error || reorder.error} />
      {bodies.length === 0 && !list.isLoading && <Empty>Органів ще немає</Empty>}
      {bodies.map((b, i) => (
        <section key={b.id} className={`card-form gov-body ${b.is_active ? '' : 'muted'}`}>
          <div className="section-bar">
            <span className="nowrap">
              <button className="btn small" title="Вище" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                ↑
              </button>{' '}
              <button className="btn small" title="Нижче" disabled={i === bodies.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                ↓
              </button>
            </span>
            <h3 className="gov-title">{b.name}</h3>
            <span className="badge">{ВИДИ[b.kind] || b.kind}</span>
            {!b.is_active && <span className="badge warn">прихований</span>}
            {b.contact_email && <span className="muted small-text">{b.contact_email}</span>}
            <span className="spacer" />
            <button className="btn small" onClick={() => setEditing(b)}>
              Редагувати орган
            </button>
          </div>
          {b.description && <p className="muted small-text">{b.description}</p>}
          <Members body={b} onChange={invalidate} />
        </section>
      ))}
      {editing && <BodyForm item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function Members({ body, onChange }) {
  const [adding, setAdding] = useState(null);
  const members = body.members || [];
  const save = useMutation({
    mutationFn: async (v) => {
      let saved = v.id ? await crm.patch(`/governing-members/${v.id}`, v.data) : await crm.post(`/governing-bodies/${body.id}/members`, v.data);
      if (v.photo) {
        const form = new FormData();
        form.append('image', v.photo);
        saved = await crm.upload(`/governing-members/${saved.id}/photo`, form);
      }
      return saved;
    },
    onSuccess: () => {
      onChange();
      setAdding(null);
    },
  });
  const toggle = useMutation({ mutationFn: ({ id, is_active }) => crm.patch(`/governing-members/${id}`, { is_active }), onSuccess: onChange });
  const reorder = useMutation({ mutationFn: (ids) => crm.post(`/governing-bodies/${body.id}/members/reorder`, { ids }), onSuccess: onChange });
  const move = (i, d) => {
    const ids = members.map((m) => m.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };
  return (
    <>
      <ErrorBox error={toggle.error || reorder.error} />
      {members.length === 0 && <div className="muted small-text">Складу ще немає</div>}
      {members.length > 0 && (
        <table className="table">
          <tbody>
            {members.map((m, i) => (
              <tr key={m.id} className={m.is_active ? '' : 'muted'}>
                <td className="nowrap">
                  <button className="btn small" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                    ↑
                  </button>{' '}
                  <button className="btn small" disabled={i === members.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                </td>
                <td>
                  <span className="club-cell">
                    {m.photo?.url ? <img src={m.photo.url} alt="" className="avatar" /> : <span className="avatar logo-empty" />}
                    <span className="strong">
                      {m.first_name} {m.last_name}
                    </span>
                  </span>
                </td>
                <td className="muted">{m.position || '—'}</td>
                <td className="row-actions">
                  {m.is_active ? (
                    <button className="btn small" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: m.id, is_active: false })}>
                      Прибрати зі складу
                    </button>
                  ) : (
                    <button className="btn small" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: m.id, is_active: true })}>
                      Повернути
                    </button>
                  )}
                  <button className="btn small" onClick={() => setAdding(m)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="section-bar">
        <button className="btn small" onClick={() => setAdding({})}>
          Додати до складу
        </button>
      </div>
      {adding && <MemberForm item={adding} body={body} onClose={() => setAdding(null)} onSave={save} />}
    </>
  );
}

function MemberForm({ item, body, onClose, onSave }) {
  const [v, setV] = useState({ first_name: item.first_name || '', last_name: item.last_name || '', position: item.position || '' });
  const [photo, setPhoto] = useState(null);
  const [прев, setПрев] = useState(null);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal title={item.id ? `${item.first_name} ${item.last_name}` : `Новий у складі: ${body.name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({ id: item.id, photo, data: { first_name: v.first_name.trim(), last_name: v.last_name.trim(), position: v.position.trim() } });
        }}
      >
        <div className="row2">
          <Field label="Ім'я">
            <input value={v.first_name} onChange={set('first_name')} required autoFocus />
          </Field>
          <Field label="Прізвище">
            <input value={v.last_name} onChange={set('last_name')} required />
          </Field>
        </div>
        <Field label="Посада" hint="«Президент», «Голова комітету», «Член комітету»">
          <input value={v.position} onChange={set('position')} required />
        </Field>
        <Field label="Фото" hint="Необов'язково">
          <div className="club-cell">
            {(прев || item.photo?.url) && <img src={прев || item.photo.url} alt="" className="avatar" />}
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
        <p className="muted small-text">По батькові, телефонів і особистої пошти тут немає навмисно: на сайті вони не показуються.</p>
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

function BodyForm({ item, onClose, onSave }) {
  const [v, setV] = useState({
    name: item.name || '',
    slug: item.slug || '',
    kind: item.kind || 'committee',
    description: item.description || '',
    contact_email: item.contact_email || '',
    is_active: item.is_active ?? true,
  });
  const [ручний, setРучний] = useState(!!item.id);
  return (
    <Modal title={item.id ? item.name : 'Новий орган'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({
            id: item.id,
            data: { name: v.name.trim(), slug: v.slug.trim(), kind: v.kind, description: v.description.trim(), contact_email: v.contact_email.trim(), is_active: v.is_active },
          });
        }}
      >
        <Field label="Назва" hint="«Президія», «Виконавчий комітет», «Комітет суддів»">
          <input
            value={v.name}
            onChange={(e) => {
              const name = e.target.value;
              setV((s) => ({ ...s, name, slug: ручний ? s.slug : makeSlug(name) }));
            }}
            required
            autoFocus
          />
        </Field>
        <div className="row2">
          <Field label="Тип">
            <select value={v.kind} onChange={(e) => setV((s) => ({ ...s, kind: e.target.value }))}>
              {Object.entries(ВИДИ).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Адреса" hint="Латиницею: komitet-suddiv">
            <input
              value={v.slug}
              onChange={(e) => {
                setРучний(true);
                setV((s) => ({ ...s, slug: e.target.value.toLowerCase() }));
              }}
              required
            />
            {v.slug && !slugValid(v.slug) && <div className="error-text">Лише малі латинські літери, цифри й дефіси</div>}
          </Field>
        </div>
        <Field label="Службова пошта органу" hint="Лише службова адреса органу, не особиста">
          <input type="email" value={v.contact_email} onChange={(e) => setV((s) => ({ ...s, contact_email: e.target.value }))} />
        </Field>
        <Field label="Опис" hint="Повноваження, коротко">
          <textarea rows={3} value={v.description} onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))} />
        </Field>
        <Toggle checked={v.is_active} onChange={(x) => setV((s) => ({ ...s, is_active: x }))} label="Показувати орган на сайті" />
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
