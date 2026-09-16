import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Empty, ErrorBox, Field, Modal, PageHeader, Tabs, Toggle, useForm } from '../components/ui.jsx';

/**
 * Користувачі й ролі — те, чого в CRM не було зовсім, а в ADMIN є окремим
 * екраном. Плюс конструктор ролей, якого немає ніде: ролі в ADMIN зашиті
 * трьома записами, а права до них правилися руками в Xano.
 *
 * Паролі сюди не приходять ніколи: ендпоінт користувачів перелічує поля
 * відповіді явно, і password серед них немає. Змінити пароль можна, побачити
 * чужий — ні.
 *
 * Два запобіжники живуть на сервері, а не тут: не можна деактивувати власний
 * акаунт і не можна забрати право «Редагування Юзерів» у ролі, на якій сидиш
 * сам. Інакше систему можна замкнути одним кліком, і повертати доступ
 * довелося б руками в базі.
 */
export default function UsersPage() {
  const [tab, setTab] = useState('users');
  return (
    <div className="page">
      <PageHeader
        title="Користувачі"
        subtitle="Вхід у CRM і ADMIN спільний: той самий числовий id і пароль. Права дає роль"
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'users', label: 'Люди' },
          { key: 'roles', label: 'Ролі' },
        ]}
      />
      {tab === 'users' && <Люди />}
      {tab === 'roles' && <Ролі />}
    </div>
  );
}

function Люди() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pass, setPass] = useState(null);

  const users = useQuery({ queryKey: ['users', archived], queryFn: () => crm.get('/users', { archived: archived || undefined }) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => crm.get('/roles') });

  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/users/${v.id}`, v.data) : crm.post('/users', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditing(null);
    },
  });
  const setPassword = useMutation({
    mutationFn: ({ id, password }) => crm.post(`/users/${id}/password`, { password }),
    onSuccess: () => setPass(null),
  });

  return (
    <section>
      <div className="section-bar">
        <Toggle checked={archived} onChange={setArchived} label="Показати й деактивованих" />
        <button className="btn primary" onClick={() => setEditing({})}>
          Новий користувач
        </button>
      </div>
      <ErrorBox error={users.error} />
      {users.data?.length === 0 && <Empty>Користувачів немає</Empty>}
      {users.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>id</th>
              <th>Імʼя</th>
              <th>Роль</th>
              <th>Стан</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id}>
                <td className="muted">{u.id}</td>
                <td className="strong">
                  {u.Name}
                  {u.id === user?.id && <span className="badge">це ви</span>}
                </td>
                <td>{u._role?.Type || '—'}</td>
                <td>{u.Relevance ? 'активний' : <span className="badge warn">деактивований</span>}</td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(u)}>
                    Редагувати
                  </button>
                  <button className="btn small" onClick={() => setPass(u)}>
                    Пароль
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <UserForm item={editing} roles={roles.data?.roles || []} me={user} onClose={() => setEditing(null)} onSave={save} />}
      {pass && <PasswordForm item={pass} onClose={() => setPass(null)} onSave={setPassword} />}
    </section>
  );
}

function UserForm({ item, roles, me, onClose, onSave }) {
  const { values, set } = useForm({
    Name: item.Name || '',
    password: '',
    types_of_user_roles_id: item.types_of_user_roles_id || roles[0]?.id || 1,
    Relevance: item.id ? !!item.Relevance : true,
  });
  const submit = (e) => {
    e.preventDefault();
    const data = { Name: values.Name.trim(), types_of_user_roles_id: Number(values.types_of_user_roles_id) };
    if (item.id) data.Relevance = values.Relevance;
    else data.password = values.password;
    onSave.mutate({ id: item.id, data });
  };
  return (
    <Modal title={item.id ? item.Name : 'Новий користувач'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Імʼя" hint="За ним людина входить у застосунки, тож воно має бути унікальним">
          <input value={values.Name} onChange={set('Name')} required autoFocus />
        </Field>
        {!item.id && (
          <Field label="Пароль" hint="Далі його можна змінити кнопкою «Пароль», але не побачити">
            <input type="password" value={values.password} onChange={set('password')} required minLength={6} />
          </Field>
        )}
        <Field label="Роль">
          <select value={values.types_of_user_roles_id} onChange={set('types_of_user_roles_id')}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.Type}
              </option>
            ))}
          </select>
        </Field>
        {item.id && item.id !== me?.id && (
          <Toggle checked={values.Relevance} onChange={set('Relevance')} label="Активний (деактивований не увійде ні в CRM, ні в ADMIN)" />
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

function PasswordForm({ item, onClose, onSave }) {
  const [password, setPassword] = useState('');
  return (
    <Modal title={`Пароль: ${item.Name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({ id: item.id, password });
        }}
      >
        <Field label="Новий пароль" hint="Старий ніде не показується — його неможливо прочитати навіть адміністратору">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoFocus />
        </Field>
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending}>
            Змінити
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Ролі() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => crm.get('/roles') });
  const [editing, setEditing] = useState(null);

  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/roles/${v.id}`, v.data) : crm.post('/roles', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditing(null);
    },
  });

  const людейНаРолі = useMemo(() => {
    const за = {};
    for (const u of roles.data?.users || []) за[u.types_of_user_roles_id] = (за[u.types_of_user_roles_id] || 0) + 1;
    return за;
  }, [roles.data]);

  const rights = roles.data?.rights || [];

  return (
    <section>
      <div className="section-bar">
        <span className="muted">
          Роль — це набір із {rights.length} прав. Право керує тим, що людина може писати; читання відкрите всім, хто
          увійшов
        </span>
        <button className="btn primary" onClick={() => setEditing({})}>
          Нова роль
        </button>
      </div>
      <ErrorBox error={roles.error} />
      {(roles.data?.roles || []).map((r) => (
        <div key={r.id} className="stage-block">
          <div className="section-bar">
            <h3>
              {r.Type}
              <span className="muted small-text"> · людей: {людейНаРолі[r.id] || 0}</span>
              {r.id === user?.types_of_user_roles_id && <span className="badge">ваша роль</span>}
            </h3>
            <button className="btn small" onClick={() => setEditing(r)}>
              Змінити права
            </button>
          </div>
          <div className="rights-row">
            {rights.map((p) => (
              <span key={p.id} className={(r.access_rights_id || []).includes(p.id) ? 'right on' : 'right off'}>
                {p.access_right}
              </span>
            ))}
          </div>
        </div>
      ))}
      {editing && <RoleForm item={editing} rights={rights} onClose={() => setEditing(null)} onSave={save} />}
    </section>
  );
}

function RoleForm({ item, rights, onClose, onSave }) {
  const [назва, setНазва] = useState(item.Type || '');
  const [обрані, setОбрані] = useState(new Set(item.access_rights_id || []));
  const перемкнути = (id) =>
    setОбрані((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <Modal title={item.id ? item.Type : 'Нова роль'} onClose={onClose} width={560}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({ id: item.id, data: { Type: назва.trim(), access_rights_id: [...обрані].sort((a, b) => a - b) } });
        }}
      >
        <Field label="Назва ролі">
          <input value={назва} onChange={(e) => setНазва(e.target.value)} required autoFocus />
        </Field>
        <Field label="Права" hint="Кожне право відкриває запис у своєму розділі. Без права форма віддає «Доступ заборонено»">
          <div className="rights-grid">
            {rights.map((p) => (
              <Toggle key={p.id} checked={обрані.has(p.id)} onChange={() => перемкнути(p.id)} label={p.access_right} />
            ))}
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
