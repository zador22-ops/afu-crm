import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { club } from '../../api/client.js';
import { Empty, ErrorBox, Field, Modal } from '../../components/ui.jsx';
import { PersonFields, PersonSearch } from './PersonFields.jsx';
import { формаШтабу } from '../../utils/clubStaff.js';

const НОВА = { prizvushche: '', Name: '', po_batkovi: '', City: '', Growth: '', Weight: '', Photo: null };

/**
 * Вкладка «Штаб» кабінету клубу (самообслуговування клубів, 3.3): чинний штаб,
 * нові з заявок, «Додати» (пошук особи → наявна чи нова → посада), «Змінити»
 * (дані особи й посада) і «Вивести». Усе — чернетки заявок; в основну базу
 * потрапить після погодження АФУ. Заявкових вікон для штабу немає.
 */
export default function ClubStaff({ teaminfoId }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const q = useQuery({ queryKey: ['club-staff', teaminfoId], queryFn: () => club.get(`/clubs/${teaminfoId}/staff`) });
  const оновити = () => {
    qc.invalidateQueries({ queryKey: ['club-staff', teaminfoId] });
    qc.invalidateQueries({ queryKey: ['club-pending', teaminfoId] });
  };
  const discard = useMutation({ mutationFn: (id) => club.del(`/clubs/${teaminfoId}/requests/${id}`), onSuccess: оновити });
  const д = q.data;
  const стан = (r) => (r ? `${r.action === 'remove' ? 'виведення' : 'зміна посади'} — ${r.status === 'draft' ? 'чернетка' : 'на погодженні'}` : null);

  return (
    <section>
      <ErrorBox error={q.error || discard.error} />
      {q.isPending && <div className="center muted">Завантаження…</div>}
      {д && (
        <>
          <div className="section-bar">
            <span className="muted small-text">Тренери, лікарі, адміністратори. Зміни — після погодження АФУ</span>
            <button className="btn primary" onClick={() => setAdding(true)}>
              Додати до штабу
            </button>
          </div>

          {д.pending.length > 0 && (
            <div className="request-batch">
              <h3>Нові в штабі — ще не погоджено</h3>
              {д.pending.map((p) => (
                <div key={p.request_id} className="request-row request-head">
                  <span>
                    <span className="strong">{p.name || 'без імені'}</span>
                    <span className="muted">
                      {' '}
                      · {p.position || 'посада?'}
                      {p.new_person ? ' · нова особа' : ''}
                    </span>
                  </span>
                  <span className="club-cell">
                    <span className={`request-status ${p.status === 'draft' ? 'muted' : 'wait'}`}>{p.status === 'draft' ? 'чернетка' : 'на погодженні'}</span>
                    {p.status === 'draft' && (
                      <button className="btn small" onClick={() => discard.mutate(p.request_id)} disabled={discard.isPending}>
                        Прибрати
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {д.staff.length === 0 && <Empty>У штабі клубу ще нікого немає</Empty>}
          {д.staff.length > 0 && (
            <table className="table cards">
              <thead>
                <tr>
                  <th>Посада</th>
                  <th>Людина</th>
                  <th>Стан</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {д.staff.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Посада">{s.position || '—'}</td>
                    <td className="strong">{s.name}</td>
                    <td data-label="Стан">
                      {s.request && <span className={`request-status ${s.request.status === 'draft' ? 'muted' : 'wait'}`}>{стан(s.request)}</span>}
                      {s.person_request && (
                        <span className={`request-status ${s.person_request.status === 'draft' ? 'muted' : 'wait'}`}>
                          дані — {s.person_request.status === 'draft' ? 'чернетка' : 'на погодженні'}
                        </span>
                      )}
                      {!s.request && !s.person_request && <span className="muted">у штабі</span>}
                    </td>
                    <td className="row-actions">
                      <button className="btn small" onClick={() => setEditing(s)}>
                        Змінити
                      </button>
                      {s.person_request?.status === 'draft' && (
                        <button className="btn small" onClick={() => discard.mutate(s.person_request.id)} disabled={discard.isPending}>
                          Скасувати зміну даних
                        </button>
                      )}
                      {s.request?.status === 'draft' && (
                        <button className="btn small" onClick={() => discard.mutate(s.request.id)} disabled={discard.isPending}>
                          Скасувати зміну
                        </button>
                      )}
                      {!s.request && (
                        <button className="btn small danger ghost" onClick={() => setRemoving(s)}>
                          Вивести
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {adding && д && <AddStaff teaminfoId={teaminfoId} positions={д.positions} onClose={() => setAdding(false)} onDone={оновити} />}
      {editing && д && <EditStaff teaminfoId={teaminfoId} item={editing} positions={д.positions} onClose={() => setEditing(null)} onDone={оновити} />}
      {removing && <RemoveStaff teaminfoId={teaminfoId} item={removing} onClose={() => setRemoving(null)} onDone={оновити} />}
    </section>
  );
}

function Посада({ positions, value, onChange }) {
  return (
    <Field label="Посада">
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Оберіть посаду</option>
        {positions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function AddStaff({ teaminfoId, positions, onClose, onDone }) {
  const [пошук, setПошук] = useState({ q: '', dob: '' });
  const [особа, setОсоба] = useState(null);
  const [нова, setНова] = useState(НОВА);
  const [посада, setПосада] = useState('');
  const [вантажимо, setВантажимо] = useState(false);
  const save = useMutation({
    mutationFn: (body) => club.post(`/clubs/${teaminfoId}/staff`, body),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const submit = (e) => {
    e.preventDefault();
    const person = особа?.people_id ? { people_id: особа.people_id } : { new: { ...нова, Date_of_birth: пошук.dob, prizvushche: нова.prizvushche || пошук.q.trim() } };
    save.mutate({ person, positions_id: Number(посада) });
  };
  return (
    <Modal title="Додати до штабу" onClose={onClose} width={640}>
      <form className="form" onSubmit={submit}>
        <PersonSearch
          teaminfoId={teaminfoId}
          пошук={пошук}
          setПошук={setПошук}
          обрана={особа}
          onPick={(о) => {
            setОсоба(о);
            if (о?.new) setНова((s) => ({ ...s, prizvushche: s.prizvushche || пошук.q.trim() }));
          }}
        />
        {особа?.new && <PersonFields teaminfoId={teaminfoId} value={нова} set={(k, v) => setНова((s) => ({ ...s, [k]: v }))} withDob={false} onBusy={setВантажимо} />}
        {особа && <Посада positions={positions} value={посада} onChange={setПосада} />}
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={!особа || !посада || save.isPending || вантажимо}>
            {save.isPending ? 'Зберігаємо…' : 'Додати в чернетку'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditStaff({ teaminfoId, item, positions, onClose, onDone }) {
  const [ф, setФ] = useState(() => формаШтабу(item));
  const [вантажимо, setВантажимо] = useState(false);
  const даніНаПогодженні = item.person_request?.status === 'submitted';
  // Виведення чи зміна посади на погодженні — посаду зараз не змінити
  const посадаЗайнята = item.request && !(item.request.status === 'draft' && item.request.action === 'update');
  const m = useMutation({
    mutationFn: () =>
      club.put(`/clubs/${teaminfoId}/staff/${item.id}`, {
        ...(даніНаПогодженні ? {} : { person: ф.person }),
        ...(посадаЗайнята ? {} : { positions_id: Number(ф.positions_id) }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Змінити: ${item.name}`} onClose={onClose} width={640}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <p className="muted small-text">Зберігається як чернетка; на сайті й у застосунку зміниться після погодження АФУ.</p>
        {даніНаПогодженні && <div className="warn-box">Зміни даних уже на погодженні — дані можна буде змінити після рішення АФУ.</div>}
        <fieldset disabled={даніНаПогодженні} className="plain">
          <PersonFields teaminfoId={teaminfoId} value={ф.person} set={(k, v) => setФ((s) => ({ ...s, person: { ...s.person, [k]: v } }))} onBusy={setВантажимо} />
        </fieldset>
        {посадаЗайнята ? (
          <div className="warn-box">Для цієї людини вже є інша відкрита зміна штабу — посаду можна буде змінити після неї.</div>
        ) : (
          <Посада positions={positions} value={ф.positions_id} onChange={(v) => setФ((s) => ({ ...s, positions_id: v }))} />
        )}
        <ErrorBox error={m.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={m.isPending || вантажимо || (даніНаПогодженні && посадаЗайнята)}>
            {m.isPending ? 'Зберігаємо…' : 'Зберегти чернетку'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RemoveStaff({ teaminfoId, item, onClose, onDone }) {
  const сьогодні = new Date().toISOString().slice(0, 10);
  const [дата, setДата] = useState(сьогодні);
  const m = useMutation({
    mutationFn: () => club.post(`/clubs/${teaminfoId}/staff/${item.id}/remove`, { end_date: дата }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Вивести зі штабу: ${item.name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <p className="muted small-text">
          {item.position}. Зміна набуде чинності після погодження АФУ; історія лишиться.
        </p>
        <Field label="Дата виведення">
          <input type="date" value={дата} max={сьогодні} onChange={(e) => setДата(e.target.value)} required />
        </Field>
        <ErrorBox error={m.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn danger" disabled={m.isPending}>
            Вивести
          </button>
        </div>
      </form>
    </Modal>
  );
}
