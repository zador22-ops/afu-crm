import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle, useForm } from '../components/ui.jsx';
import PhotoCropper from '../components/PhotoCropper.jsx';

export default function CompetitionsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['competitions'], queryFn: () => crm.get('/competitions') });
  const [editing, setEditing] = useState(null);
  const save = useMutation({
    mutationFn: async (v) => {
      const saved = v.id ? await crm.patch(`/competitions/${v.id}`, v.data) : await crm.post('/competitions', v.data);
      // R27: окремий ендпоінт; нове змагання й так показується (типово true)
      if (v.show_in_app !== undefined && v.show_in_app !== (saved.show_in_app ?? true)) {
        await crm.patch(`/competitions/${saved.id}/visibility`, { show_in_app: v.show_in_app });
      }
      if (v.logo) {
        // Логотип живе у league.logo — один на змагання, спільний для всіх його сезонів
        const form = new FormData();
        form.append('image', v.logo);
        await crm.upload(`/competitions/${saved.id}/logo`, form);
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitions'] });
      setEditing(null);
    },
  });
  // Сервер відмовляє, якщо на змагання посилається хоч один турнір сезону,
  // і називає ці турніри — повідомлення показуємо у формі
  const visibility = useMutation({
    mutationFn: ({ id, show_in_app }) => crm.patch(`/competitions/${id}/visibility`, { show_in_app }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitions'] }),
  });
  const remove = useMutation({
    mutationFn: (id) => crm.del(`/competitions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['competitions'] });
      setEditing(null);
    },
  });

  return (
    <div className="page">
      <PageHeader
        title="Змагання"
        subtitle="Ліга має таблицю і, за потреби, плей-оф; кубок — лише сітку; міжнародне — лише матчі (збірна, єврокубки). Турнір сезону посилається на змагання. «У застосунку» знято — змагання не показується в шторці «Змагання» і в пікерах застосунку; його матчі й таблиці лишаються"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Нове змагання
          </button>
        }
      />
      <ErrorBox error={list.error || visibility.error} />
      {list.data?.length === 0 && <Empty>Змагань ще немає</Empty>}
      {list.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Назва</th>
              <th>Коротка</th>
              <th>Тип</th>
              <th>Порядок</th>
              <th>У застосунку</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="club-cell">
                    {c.logo?.url ? <img src={c.logo.url} alt="" className="logo-sm" /> : <span className="logo-sm logo-empty" />}
                    <span className="strong">{c.name}</span>
                  </span>
                </td>
                <td className="muted">{c.short_name || '—'}</td>
                <td>
                  <span className={`badge ${c.type === 'кубок' ? 'cup' : c.type === 'міжнародне' ? 'intl' : 'league'}`}>{c.type || '—'}</span>
                </td>
                <td>{c.sort_order}</td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Показувати «${c.name}» у застосунку`}
                    title="Показувати в шторці «Змагання» застосунку"
                    checked={c.show_in_app !== false}
                    disabled={visibility.isPending}
                    onChange={(e) => visibility.mutate({ id: c.id, show_in_app: e.target.checked })}
                  />
                </td>
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
      {editing && <CompetitionForm item={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </div>
  );
}

function CompetitionForm({ item, onClose, onSave, onDelete }) {
  const { values, set } = useForm({
    name: item.name || '',
    type: item.type || 'ліга',
    short_name: item.short_name || '',
    sort_order: item.sort_order ?? 0,
  });
  const [показувати, setПоказувати] = useState(item.show_in_app !== false);
  const [logo, setLogo] = useState(null);
  const чинний = item.logo?.url || null;
  const [прев, setПрев] = useState(null);
  const [кадруємо, setКадруємо] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    onSave.mutate({
      id: item.id,
      logo,
      show_in_app: показувати,
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
              <option value="міжнародне">міжнародне</option>
            </select>
          </Field>
          <Field label="Порядок у списках">
            <input type="number" value={values.sort_order} onChange={set('sort_order')} />
          </Field>
        </div>
        <Field label="Коротка назва">
          <input value={values.short_name} onChange={set('short_name')} />
        </Field>
        <Toggle
          checked={показувати}
          onChange={setПоказувати}
          label="Показувати в застосунку (шторка «Змагання»). Знято — змагання не показується в шторці й пікерах; його матчі й таблиці лишаються"
        />
        <Field label="Логотип" hint="Один на змагання, спільний для всіх його сезонів. Застосунок читає його через звʼязок турніру зі змаганням">
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
        {confirming && (
          <div className="danger-box">
            <div className="strong">Видалити змагання «{item.name}» назавжди?</div>
            <div className="muted small-text">
              Якщо на нього посилається хоч один турнір сезону, сервер відмовить і назве ці турніри.
            </div>
            <ErrorBox error={onDelete.error} />
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Ні, лишити
              </button>
              <button type="button" className="btn danger" disabled={onDelete.isPending} onClick={() => onDelete.mutate(item.id)}>
                Так, видалити
              </button>
            </div>
          </div>
        )}
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          {item.id && !confirming && (
            <button type="button" className="btn danger ghost" onClick={() => setConfirming(true)}>
              Видалити змагання
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending || confirming}>
            Зберегти
          </button>
        </div>
      </form>
    </Modal>
  );
}
