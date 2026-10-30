import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { useClub } from '../auth/ClubContext.jsx';
import { Empty, ErrorBox, Field, Modal, Toggle } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';
import { даніАкаунта, клубиДляВибору, помилкаАкаунтів } from '../utils/clubAccounts.js';

/**
 * «Користувачі» → «Акаунти клубів» (самообслуговування клубів, 1.3; право 22
 * перевіряє сервер). Пароль задає АФУ звичайним полем форми й більше ніде не
 * бачить: сервер його не віддає, а поле очищується після збереження. Тексти
 * помилок — як їх повертає сервер (docs/club-self-service-api.md).
 */
export default function ClubAccounts() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { asAdmin } = useClub();
  const [editing, setEditing] = useState(null);
  const list = useQuery({ queryKey: ['club-accounts'], queryFn: () => crm.get('/club-accounts') });
  const clubs = useQuery({ queryKey: ['clubs', 'all-for-accounts'], queryFn: () => crm.get('/clubs', { archived: true }) });

  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/club-accounts/${v.id}`, v.data) : crm.post('/club-accounts', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['club-accounts'] });
      setEditing(null);
    },
  });
  const enter = useMutation({
    mutationFn: (id) => asAdmin(id),
    onSuccess: () => nav('/club', { replace: true }),
  });

  return (
    <section>
      <div className="section-bar">
        <span className="muted">
          Вхід для представників клубів — пошта й пароль на окремій сторінці «Кабінет клубу». Один акаунт на клуб; кілька
          клубів — лише материнський і фарм-клуб
        </span>
        <button className="btn primary" onClick={() => setEditing({})}>
          Новий акаунт клубу
        </button>
      </div>
      <ErrorBox error={помилкаАкаунтів(list.error || enter.error)} />
      {list.data?.length === 0 && <Empty>Акаунтів клубів ще немає</Empty>}
      {list.data?.length > 0 && (
        <table className="table cards">
          <thead>
            <tr>
              <th>Акаунт</th>
              <th>Клуби</th>
              <th>Стан</th>
              <th>Останній вхід</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="strong">{a.name}</span>
                  <div className="muted small-text">{a.email}</div>
                </td>
                <td data-label="Клуби">{(a.clubs || []).map((c) => c.name || `клуб ${c.teaminfo_id}`).join(', ') || '—'}</td>
                <td data-label="Стан">{a.is_active ? 'активний' : <span className="badge warn">вимкнено</span>}</td>
                <td data-label="Вхід" className="muted">
                  {a.last_login_at ? kyivDateTimeString(a.last_login_at) : 'ще не входив'}
                </td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(a)}>
                    Змінити
                  </button>
                  <button
                    className="btn small"
                    disabled={!a.is_active || !(a.clubs || []).length || enter.isPending}
                    onClick={() => enter.mutate(a.id)}
                    title="Відкрити кабінет цього клубу на 1 год, щоб допомогти заповнити дані"
                  >
                    Увійти як клуб
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <AccountForm
          item={editing}
          clubs={clubs.data || []}
          clubsError={clubs.error}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </section>
  );
}

function AccountForm({ item, clubs, clubsError, onClose, onSave }) {
  const новий = !item.id;
  const [email, setEmail] = useState('');
  const [name, setName] = useState(item.name || '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(item.is_active !== false);
  const [обрані, setОбрані] = useState(() => new Set((item.clubs || []).map((c) => c.teaminfo_id)));
  const [q, setQ] = useState('');
  const список = useMemo(() => клубиДляВибору(clubs, q, обрані), [clubs, q, обрані]);

  const submit = (e) => {
    e.preventDefault();
    onSave.mutate({ id: item.id, data: даніАкаунта(item, { email, name, password, active, обрані }) });
    // Пароль не тримаємо у формі довше, ніж треба для запиту
    setPassword('');
  };
  const перемкнути = (id) =>
    setОбрані((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Modal title={новий ? 'Новий акаунт клубу' : item.name} onClose={onClose} width={560}>
      <form className="form" onSubmit={submit}>
        {новий ? (
          <Field label="Пошта" hint="Нею представник клубу входить у кабінет; листи про рішення АФУ теж прийдуть сюди">
            <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
        ) : (
          <div className="muted small-text">Пошта: {item.email}</div>
        )}
        <Field label="Назва акаунта" hint="Як підписати в CRM, напр. «ФК Сокіл»">
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </Field>
        <Field
          label={новий ? 'Пароль' : 'Новий пароль'}
          hint={новий ? 'Щонайменше 8 символів. Передайте клубу окремо; тут він більше не показується' : 'Порожньо — пароль не змінюється. Уже видані входи діють до 12 год'}
        >
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={новий}
            minLength={8}
          />
        </Field>
        {!новий && (
          <Field label="Стан">
            <Toggle checked={active} onChange={setActive} label={active ? 'активний — вхід дозволено' : 'вимкнено — вхід заборонено'} />
          </Field>
        )}
        <Field label={`Клуби — обрано ${обрані.size}`} hint="Зазвичай один. Два — лише материнський клуб і його фарм-клуб">
          <input className="search" placeholder="Пошук клубу" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <ErrorBox error={clubsError} />
        <div className="pick-list">
          {список.map((c) => (
            <label key={c.id} className="pick">
              <input type="checkbox" checked={обрані.has(c.id)} onChange={() => перемкнути(c.id)} />
              <span>
                {c.TeamName}
                {c.Relevance === false && <span className="muted small-text"> · архів</span>}
              </span>
            </label>
          ))}
          {список.length === 0 && <div className="muted small-text">Нічого не знайшлось</div>}
        </div>
        <ErrorBox error={помилкаАкаунтів(onSave.error)} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending || обрані.size === 0}>
            {onSave.isPending ? 'Зберігаємо…' : новий ? 'Створити акаунт' : 'Зберегти'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
