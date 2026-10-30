import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { club } from '../../api/client.js';
import { Empty, ErrorBox, Field, Modal } from '../../components/ui.jsx';
import { kyivDateTimeString } from '../../utils/kyivTime.js';
import { PersonFields, PersonSearch } from './PersonFields.jsx';
import { виведенняЗ, рядкиДляЗаявки, станРядка, формаГравця } from '../../utils/clubSquad.js';


/**
 * Вкладка «Склад» кабінету клубу (самообслуговування клубів, 3.1): чинні
 * гравці турнірів поточного сезону, нові гравці з заявок, «Додати гравця»
 * (пошук особи → наявна чи нова → галочки турнірів з номером) і «Вивести».
 * Усе — чернетки заявок; в основну базу потрапить після погодження АФУ.
 */
export default function ClubSquad({ teaminfoId }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [editing, setEditing] = useState(null);
  const q = useQuery({ queryKey: ['club-squad', teaminfoId], queryFn: () => club.get(`/clubs/${teaminfoId}/squad`) });
  const оновити = () => {
    qc.invalidateQueries({ queryKey: ['club-squad', teaminfoId] });
    qc.invalidateQueries({ queryKey: ['club-pending', teaminfoId] });
  };
  const discard = useMutation({ mutationFn: (id) => club.del(`/clubs/${teaminfoId}/requests/${id}`), onSuccess: оновити });
  const д = q.data;
  const відкритий = (leaguesId) => (д?.tournaments || []).find((t) => t.id === leaguesId)?.window_open;

  return (
    <section>
      <ErrorBox error={q.error || discard.error} />
      {q.isPending && <div className="center muted">Завантаження…</div>}
      {д && (
        <>
          <div className="section-bar">
            <span className="muted small-text">
              {д.tournaments.length === 0
                ? 'Клуб не бере участі в жодному турнірі поточного сезону'
                : д.tournaments
                    .map((t) => `${t.name}: ${t.window_open ? 'заявки відкриті' : t.next_window_at ? `вікно з ${kyivDateTimeString(t.next_window_at)}` : 'вікно закрите'}`)
                    .join(' · ')}
            </span>
            <button className="btn primary" onClick={() => setAdding(true)} disabled={!д.tournaments.some((t) => t.window_open)}>
              Додати гравця
            </button>
          </div>

          {д.pending.length > 0 && (
            <div className="request-batch">
              <h3>Нові в складі — ще не погоджено</h3>
              {д.pending.map((p) => (
                <div key={p.request_id} className="request-row request-head">
                  <span>
                    <span className="strong">{p.name || 'без імені'}</span>
                    <span className="muted">
                      {' '}
                      · {p.league_name} · №{p.Number}
                      {p.position ? ` · ${p.position}` : ''}
                      {p.transfer_from ? ` · перехід із: ${p.transfer_from}` : ''}
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

          {д.players.length === 0 && <Empty>У складі турнірів поточного сезону ще немає гравців</Empty>}
          {д.players.length > 0 && (
            <table className="table cards">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Гравець</th>
                  <th>Позиція</th>
                  <th>Турнір</th>
                  <th>Стан</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {д.players.map((p) => {
                  const стан = станРядка(p.request, p.request && p.request.leagues_id !== p.leagues_id ? p.also.find((д) => д.leagues_id === p.request.leagues_id)?.league_name : null);
                  return (
                    <tr key={p.team_id}>
                      <td data-label="№">{p.Number ?? '—'}</td>
                      <td className="strong">
                        {p.name}
                        {p.Captain && <span className="badge">капітан</span>}
                      </td>
                      <td data-label="Позиція">{p.position || '—'}</td>
                      <td data-label="Турнір" className="muted">
                        {p.league_name}
                        {p.also.length > 0 && <div className="small-text">також: {p.also.map((д) => `${д.league_name} №${д.Number ?? '—'}`).join(', ')}</div>}
                      </td>
                      <td data-label="Стан">
                        {стан && <span className={`request-status ${стан.тон}`}>{стан.текст}</span>}
                        {p.person_request && (
                          <span className={`request-status ${p.person_request.status === 'draft' ? 'muted' : 'wait'}`}>
                            дані — {p.person_request.status === 'draft' ? 'чернетка' : 'на погодженні'}
                          </span>
                        )}
                        {!стан && !p.person_request && <span className="muted">у складі</span>}
                      </td>
                      <td className="row-actions">
                        <button className="btn small" onClick={() => setEditing(p)}>
                          Змінити
                        </button>
                        {p.person_request?.status === 'draft' && (
                          <button className="btn small" onClick={() => discard.mutate(p.person_request.id)} disabled={discard.isPending}>
                            Скасувати зміну даних
                          </button>
                        )}
                        {p.request?.status === 'draft' && (
                          <button className="btn small" onClick={() => discard.mutate(p.request.id)} disabled={discard.isPending}>
                            Скасувати зміну
                          </button>
                        )}
                        {!p.request && (
                          <button className="btn small danger ghost" onClick={() => setRemoving(p)} disabled={![p.leagues_id, ...p.also.map((д) => д.leagues_id)].some(відкритий)}>
                            Вивести
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
      {editing && <EditPlayer teaminfoId={teaminfoId} player={editing} squad={д} onClose={() => setEditing(null)} onDone={оновити} />}
      {removing && <RemoveDialog teaminfoId={teaminfoId} player={removing} tournaments={д?.tournaments || []} onClose={() => setRemoving(null)} onDone={оновити} />}
      {adding && д && <AddPlayer teaminfoId={teaminfoId} squad={д} onClose={() => setAdding(false)} onDone={оновити} />}
    </section>
  );
}

function EditPlayer({ teaminfoId, player, squad, onClose, onDone }) {
  const [ліга, setЛіга] = useState(player.leagues_id);
  const [ф, setФ] = useState(() => формаГравця(player));
  const [вантажимо, setВантажимо] = useState(false);
  const наПогодженні = player.person_request?.status === 'submitted';
  const чужаЗміна = player.request && !(player.request.status === 'draft' && player.request.action === 'update' && player.request.leagues_id === Number(ліга));
  const турніри = виведенняЗ(player, squad.tournaments);
  const setP = (k, v) => setФ((s) => ({ ...s, person: { ...s.person, [k]: v } }));
  const setS = (k, v) => setФ((s) => ({ ...s, squad: { ...s.squad, [k]: v } }));
  const m = useMutation({
    mutationFn: () =>
      club.put(`/clubs/${teaminfoId}/players/${player.team_id}`, {
        ...(наПогодженні ? {} : { person: ф.person }),
        ...(чужаЗміна ? {} : { squad: ф.squad }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Змінити: ${player.name}`} onClose={onClose} width={640}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <p className="muted small-text">Зберігається як чернетка; на сайті й у застосунку зміниться після погодження АФУ.</p>
        {наПогодженні && <div className="warn-box">Зміни даних гравця вже на погодженні — дані можна буде змінити після рішення АФУ.</div>}
        <fieldset disabled={наПогодженні} className="plain">
          <PersonFields teaminfoId={teaminfoId} value={ф.person} set={setP} onBusy={setВантажимо} />
        </fieldset>

        <Field label="Турнір" hint={ф.основний ? 'Основний турнір: номер, позиція, капітан' : 'Додатковий турнір: лише номер'}>
          <select
            value={ліга}
            onChange={(e) => {
              setЛіга(Number(e.target.value));
              setФ((s) => ({ ...s, ...формаГравця(player, e.target.value), person: s.person }));
            }}
          >
            {турніри.map((т) => (
              <option key={т.leagues_id} value={т.leagues_id}>
                {т.name}
                {т.main ? ' (основний)' : ''}
              </option>
            ))}
          </select>
        </Field>
        {чужаЗміна ? (
          <div className="warn-box">Для цього гравця вже є інша відкрита зміна складу (за раз — один турнір). Номер і позицію можна буде змінити після неї.</div>
        ) : (
          <div className="club-cell">
            <input className="squad-number" inputMode="numeric" placeholder="№" value={ф.squad.Number} onChange={(e) => setS('Number', e.target.value)} required aria-label="Номер" />
            {ф.основний && (
              <>
                <select value={ф.squad.positions_id} onChange={(e) => setS('positions_id', e.target.value)} required aria-label="Позиція">
                  {squad.positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="club-cell small-text">
                  <input type="checkbox" checked={!!ф.squad.Captain} onChange={(e) => setS('Captain', e.target.checked)} />
                  капітан
                </label>
              </>
            )}
          </div>
        )}

        <ErrorBox error={m.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={m.isPending || вантажимо || (наПогодженні && чужаЗміна)}>
            {m.isPending ? 'Зберігаємо…' : 'Зберегти чернетку'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RemoveDialog({ teaminfoId, player, tournaments, onClose, onDone }) {
  const [дата, setДата] = useState(() => new Date().toISOString().slice(0, 10));
  const варіанти = виведенняЗ(player, tournaments);
  const [ліга, setЛіга] = useState(() => (варіанти.find((в) => в.open) || варіанти[0]).leagues_id);
  const обраний = варіанти.find((в) => в.leagues_id === Number(ліга));
  const m = useMutation({
    mutationFn: () => club.post(`/clubs/${teaminfoId}/players/${player.team_id}/remove`, { leagues_id: Number(ліга), end_date: дата }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Вивести: ${player.name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        {варіанти.length > 1 ? (
          <Field label="З якого турніру" hint={обраний?.main ? 'Основний турнір: якщо гравець є в інших, основним стане найраніший з них' : 'Гравець лишиться в складі інших турнірів'}>
            <select value={ліга} onChange={(e) => setЛіга(e.target.value)}>
              {варіанти.map((в) => (
                <option key={в.leagues_id} value={в.leagues_id} disabled={!в.open}>
                  {в.name}
                  {в.main ? ' (основний)' : ''}
                  {в.open ? '' : ' — вікно закрите'}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="muted small-text">{player.league_name}</p>
        )}
        <p className="muted small-text">Зміна набуде чинності після погодження АФУ; історія виступів гравця лишиться.</p>
        <Field label="Дата виведення">
          <input type="date" value={дата} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setДата(e.target.value)} required />
        </Field>
        <ErrorBox error={m.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn danger" disabled={m.isPending || !обраний?.open}>
            Вивести
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddPlayer({ teaminfoId, squad, onClose, onDone }) {
  const [пошук, setПошук] = useState({ q: '', dob: '' });
  const [особа, setОсоба] = useState(null); // {people_id, label, active_clubs} | {new: {...}}
  const [нова, setНова] = useState({ prizvushche: '', Name: '', po_batkovi: '', City: '', Growth: '', Weight: '', Photo: null });
  const [турніри, setТурніри] = useState({}); // leagues_id → {on, Number, positions_id, Captain}
  const [вантажимо, setВантажимо] = useState(false);
  const save = useMutation({
    mutationFn: (body) => club.post(`/clubs/${teaminfoId}/players`, body),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const рядки = рядкиДляЗаявки(турніри);
  // Варіант 3: перший обраний турнір стає основним — якщо людина ще не в складі клубу
  const вСкладі = особа?.people_id && squad.players.some((p) => p.people_id === особа.people_id);
  const основний = вСкладі ? null : рядки[0]?.leagues_id;
  const submit = (e) => {
    e.preventDefault();
    const person = особа?.people_id ? { people_id: особа.people_id } : { new: { ...нова, Date_of_birth: пошук.dob, prizvushche: нова.prizvushche || пошук.q.trim() } };
    save.mutate({ person, rows: рядки });
  };
  const перехід = особа?.active_clubs?.filter((c) => c.teaminfo_id !== teaminfoId) || [];

  return (
    <Modal title="Додати гравця" onClose={onClose} width={640}>
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
        {перехід.length > 0 && (
          <div className="warn-box">
            Зараз у складі: {перехід.map((c) => c.name).join(', ')}. Якщо це не ваш материнський чи фарм-клуб — це перехід, його погоджує АФУ.
          </div>
        )}

        {особа?.new && <PersonFields teaminfoId={teaminfoId} value={нова} set={(k, v) => setНова((s) => ({ ...s, [k]: v }))} withDob={false} onBusy={setВантажимо} />}

        {особа && (
          <Field label="Турніри — у які заявити" hint={вСкладі ? 'Гравець уже в складі клубу: його основний турнір не зміниться' : 'Перший обраний турнір стане основним'}>
            <div className="pick-list">
              {squad.tournaments.map((t) => {
                const р = турніри[t.id] || {};
                return (
                  <div key={t.id} className="pick squad-league">
                    <label className="club-cell">
                      <input
                        type="checkbox"
                        disabled={!t.window_open}
                        checked={!!р.on}
                        onChange={(e) =>
                          setТурніри((s) => {
                            // номер типово той самий, що в першому обраному турнірі
                            const перший = Object.values(s).find((x) => x.on);
                            const порядок = Math.max(0, ...Object.values(s).map((x) => x.order || 0)) + 1;
                            return { ...s, [t.id]: { Number: перший?.Number || '', positions_id: перший?.positions_id || '', Captain: false, ...s[t.id], on: e.target.checked, order: порядок } };
                          })
                        }
                      />
                      <span>
                        {t.name}
                        {основний === t.id && рядки.length > 1 && <span className="badge">основний</span>}
                        {!t.window_open && (
                          <span className="muted small-text"> · {t.next_window_at ? `вікно з ${kyivDateTimeString(t.next_window_at)}` : 'вікно закрите'}</span>
                        )}
                      </span>
                    </label>
                    {р.on && (
                      <span className="club-cell">
                        <input
                          className="squad-number"
                          inputMode="numeric"
                          placeholder="№"
                          value={р.Number}
                          onChange={(e) => setТурніри((s) => ({ ...s, [t.id]: { ...s[t.id], Number: e.target.value } }))}
                          required
                        />
                        <select value={р.positions_id} onChange={(e) => setТурніри((s) => ({ ...s, [t.id]: { ...s[t.id], positions_id: e.target.value } }))} required>
                          <option value="">Позиція</option>
                          {squad.positions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <label className="club-cell small-text">
                          <input type="checkbox" checked={!!р.Captain} onChange={(e) => setТурніри((s) => ({ ...s, [t.id]: { ...s[t.id], Captain: e.target.checked } }))} />
                          капітан
                        </label>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
        )}

        <ErrorBox error={save.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={!особа || рядки.length === 0 || save.isPending || вантажимо}>
            {save.isPending ? 'Зберігаємо…' : 'Додати в чернетку'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
