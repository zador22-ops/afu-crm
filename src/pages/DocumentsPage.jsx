import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Tabs, Toggle, fmtDate } from '../components/ui.jsx';
import { makeSlug, slugValid } from '../utils/slug.js';

// Документи для сайту (afu-crm#6): нормативні, регламентні, рішення органів.
// Файл — PDF або DOCX. Сайт показує лише опубліковані документи з файлом в
// активних рубриках. Опублікувати без файлу сервер не дасть.
export default function DocumentsPage() {
  const [tab, setTab] = useState('docs');
  return (
    <div className="page">
      <PageHeader title="Документи" subtitle="Розділ «Документи» сайту futsal.com.ua. Сайт показує лише опубліковані документи з файлом у рубриках, що показуються" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'docs', label: 'Документи' },
          { key: 'cats', label: 'Рубрики' },
        ]}
      />
      {tab === 'docs' ? <Docs /> : <Categories />}
    </div>
  );
}

function Docs() {
  const qc = useQueryClient();
  const [category_id, setCat] = useState('');
  const [editing, setEditing] = useState(null);
  const cats = useQuery({ queryKey: ['document-categories'], queryFn: () => crm.get('/document-categories') });
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: () => crm.get('/seasons') });
  const list = useQuery({ queryKey: ['documents', category_id], queryFn: () => crm.get('/documents', { category_id: category_id || undefined }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['documents'] });
  const save = useMutation({
    mutationFn: async (v) => {
      let saved = v.id ? await crm.patch(`/documents/${v.id}`, v.data) : await crm.post('/documents', v.data);
      if (v.file) {
        const form = new FormData();
        form.append('file', v.file);
        saved = await crm.upload(`/documents/${saved.id}/file`, form);
      }
      // Публікацію ставимо після файлу: без файлу сервер відмовить
      if (v.publish !== undefined && v.publish !== Boolean(saved.is_published)) saved = await crm.patch(`/documents/${saved.id}`, { is_published: v.publish });
      return saved;
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const publish = useMutation({ mutationFn: ({ id, is_published }) => crm.patch(`/documents/${id}`, { is_published }), onSuccess: invalidate });
  const C = Object.fromEntries((cats.data || []).map((c) => [c.id, c.name]));
  const items = list.data || [];

  return (
    <section>
      <div className="section-bar">
        <select value={category_id} onChange={(e) => setCat(e.target.value)}>
          <option value="">Усі рубрики</option>
          {(cats.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn primary" disabled={!cats.data?.length} onClick={() => setEditing({})}>
          Новий документ
        </button>
      </div>
      <ErrorBox error={list.error || publish.error} />
      {cats.data?.length === 0 && <Empty>Спершу створіть рубрику у вкладці «Рубрики»</Empty>}
      {cats.data?.length > 0 && items.length === 0 && !list.isLoading && <Empty>Документів ще немає</Empty>}
      {items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Документ</th>
              <th>Рубрика</th>
              <th>Дата</th>
              <th>Файл</th>
              <th>Опубліковано</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className={d.is_published ? '' : 'muted'}>
                <td>
                  <span className="strong">{d.title}</span>
                  {d.description && (
                    <>
                      <br />
                      <span className="muted small-text">{d.description}</span>
                    </>
                  )}
                </td>
                <td className="muted">{C[d.category_id] || '—'}</td>
                <td className="muted nowrap">{d.document_date ? fmtDate(d.document_date) : '—'}</td>
                <td className="muted">{d.file ? (d.file.name || 'файл') : <span className="badge warn">немає</span>}</td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Опублікувати «${d.title}»`}
                    title={d.file ? 'Показувати на сайті' : 'Спершу завантажте файл'}
                    checked={Boolean(d.is_published)}
                    disabled={publish.isPending || (!d.file && !d.is_published)}
                    onChange={(e) => publish.mutate({ id: d.id, is_published: e.target.checked })}
                  />
                </td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(d)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <DocForm item={editing} cats={cats.data || []} seasons={seasons.data || []} onClose={() => setEditing(null)} onSave={save} />}
    </section>
  );
}

function DocForm({ item, cats, seasons, onClose, onSave }) {
  const [v, setV] = useState({
    title: item.title || '',
    category_id: item.category_id || cats[0]?.id || '',
    description: item.description || '',
    document_date: item.document_date || '',
    season_id: item.season_id || '',
    publish: Boolean(item.is_published),
  });
  const [file, setFile] = useState(null);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const єФайл = Boolean(file || item.file);
  return (
    <Modal title={item.id ? item.title : 'Новий документ'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({
            id: item.id,
            file,
            publish: єФайл ? v.publish : false,
            data: {
              title: v.title.trim(),
              category_id: Number(v.category_id),
              description: v.description.trim(),
              document_date: v.document_date || null,
              season_id: v.season_id ? Number(v.season_id) : null,
            },
          });
        }}
      >
        <Field label="Назва документа">
          <input value={v.title} onChange={set('title')} required autoFocus />
        </Field>
        <div className="row2">
          <Field label="Рубрика">
            <select value={v.category_id} onChange={set('category_id')} required>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата ухвалення чи редакції" hint="Необов'язково">
            <input type="date" value={v.document_date} onChange={set('document_date')} />
          </Field>
        </div>
        <Field label="Сезон" hint="Необов'язково: для регламентів сезону">
          <select value={v.season_id} onChange={set('season_id')}>
            <option value="">— без сезону —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Короткий опис" hint="Необов'язково">
          <textarea rows={2} value={v.description} onChange={set('description')} />
        </Field>
        <Field label="Файл" hint={item.file ? `Зараз: ${item.file.name || 'файл'}. Новий файл замінить його` : 'PDF або DOCX'}>
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <Toggle
          checked={v.publish && єФайл}
          onChange={(x) => setV((s) => ({ ...s, publish: x }))}
          label={єФайл ? 'Опублікувати на сайті' : 'Опублікувати можна після завантаження файлу'}
        />
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

function Categories() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['document-categories'], queryFn: () => crm.get('/document-categories') });
  const [editing, setEditing] = useState(null);
  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/document-categories/${v.id}`, v.data) : crm.post('/document-categories', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-categories'] });
      setEditing(null);
    },
  });
  return (
    <section>
      <div className="section-bar">
        <span className="muted">«Нормативні», «Регламентні», «Рішення органів управління». Прихована рубрика ховає й свої документи</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEditing({})}>
          Нова рубрика
        </button>
      </div>
      <ErrorBox error={list.error} />
      {list.data?.length === 0 && <Empty>Рубрик ще немає</Empty>}
      {list.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Рубрика</th>
              <th>Адреса</th>
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
      {editing && <CategoryForm item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </section>
  );
}

function CategoryForm({ item, onClose, onSave }) {
  const [v, setV] = useState({ name: item.name || '', slug: item.slug || '', sort_order: item.sort_order ?? 0, is_active: item.is_active ?? true });
  const [ручний, setРучний] = useState(!!item.id);
  return (
    <Modal title={item.id ? item.name : 'Нова рубрика'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({ id: item.id, data: { name: v.name.trim(), slug: v.slug.trim(), sort_order: Number(v.sort_order) || 0, is_active: v.is_active } });
        }}
      >
        <Field label="Назва">
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
          <Field label="Адреса" hint="Латиницею: normatyvni">
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
          <Field label="Порядок">
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
