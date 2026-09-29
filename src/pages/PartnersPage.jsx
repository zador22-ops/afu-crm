import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle } from '../components/ui.jsx';

// Партнери для футера сайту (afu-crm#5). Порядок — стрілками, зберігається в
// sort_order одним запитом /partners/reorder. «Приховати» — is_active = false:
// партнер лишається в CRM, але сайт його не показує.
export default function PartnersPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['partners'], queryFn: () => crm.get('/partners') });
  const [editing, setEditing] = useState(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['partners'] });

  const save = useMutation({
    mutationFn: async (v) => {
      const saved = v.id ? await crm.patch(`/partners/${v.id}`, v.data) : await crm.post('/partners', v.data);
      if (v.logo) {
        const form = new FormData();
        form.append('image', v.logo);
        return crm.upload(`/partners/${saved.id}/logo`, form);
      }
      return saved;
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_active }) => crm.patch(`/partners/${id}`, { is_active }),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (ids) => crm.post('/partners/reorder', { ids }),
    onSuccess: invalidate,
  });

  const items = list.data || [];
  const move = (i, d) => {
    const ids = items.map((p) => p.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <div className="page">
      <PageHeader
        title="Партнери"
        subtitle="Блок «Партнери» у футері сайту futsal.com.ua. Сайт показує лише тих, хто не прихований, у порядку цього списку"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Новий партнер
          </button>
        }
      />
      <ErrorBox error={list.error || toggle.error || reorder.error} />
      {items.length === 0 && !list.isLoading && <Empty>Партнерів ще немає</Empty>}
      {items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Порядок</th>
              <th>Партнер</th>
              <th>Категорія</th>
              <th>Сайт</th>
              <th>На сайті</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p, i) => (
              <tr key={p.id} className={p.is_active ? '' : 'muted'}>
                <td className="nowrap">
                  <button className="btn small" title="Вище" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                    ↑
                  </button>{' '}
                  <button className="btn small" title="Нижче" disabled={i === items.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                </td>
                <td>
                  <span className="club-cell">
                    {p.logo?.url ? <img src={p.logo.url} alt="" className="partner-logo" /> : <span className="partner-logo logo-empty" />}
                    <span className="strong">{p.name}</span>
                  </span>
                </td>
                <td className="muted">{p.category || '—'}</td>
                <td className="muted">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      {p.url.replace(/^https:\/\//, '')}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Показувати «${p.name}» на сайті`}
                    checked={Boolean(p.is_active)}
                    disabled={toggle.isPending}
                    onChange={(e) => toggle.mutate({ id: p.id, is_active: e.target.checked })}
                  />
                </td>
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
      {editing && <PartnerForm item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

const httpsOk = (u) => !u || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(u);

function PartnerForm({ item, onClose, onSave }) {
  const [v, setV] = useState({
    name: item.name || '',
    url: item.url || '',
    category: item.category || '',
    is_active: item.is_active ?? true,
  });
  const [logo, setLogo] = useState(null);
  const [прев, setПрев] = useState(null);
  const чинний = item.logo?.url || null;
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));

  return (
    <Modal title={item.id ? item.name : 'Новий партнер'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({
            id: item.id,
            logo,
            data: { name: v.name.trim(), url: v.url.trim(), category: v.category.trim(), is_active: v.is_active },
          });
        }}
      >
        <Field label="Назва" hint="Показується як підказка й опис логотипа для людей з вадами зору">
          <input value={v.name} onChange={set('name')} required autoFocus />
        </Field>
        <Field label="Логотип" hint="Бажано PNG з прозорим тлом. Завантажується як є, без кадрування">
          <div className="club-cell">
            {(прев || чинний) && <img src={прев || чинний} alt="" className="partner-logo big" />}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setLogo(f);
                setПрев(f ? URL.createObjectURL(f) : null);
              }}
            />
          </div>
        </Field>
        <Field label="Сайт партнера" hint="Необов'язково; лише https://">
          <input value={v.url} onChange={set('url')} placeholder="https://…" />
          {!httpsOk(v.url.trim()) && <div className="error-text">Адреса має починатися з https://</div>}
        </Field>
        <Field label="Категорія" hint="Необов'язково: «генеральний», «офіційний», «медіа»">
          <input value={v.category} onChange={set('category')} list="partner-categories" />
          <datalist id="partner-categories">
            <option value="генеральний" />
            <option value="офіційний" />
            <option value="медіа" />
          </datalist>
        </Field>
        <Toggle checked={v.is_active} onChange={(x) => setV((s) => ({ ...s, is_active: x }))} label="Показувати на сайті" />
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending || !httpsOk(v.url.trim())}>
            Зберегти
          </button>
        </div>
      </form>
    </Modal>
  );
}
