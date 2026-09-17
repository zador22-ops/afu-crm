import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, useForm } from '../components/ui.jsx';

/**
 * Матчі турніру: календар, створення й редагування.
 *
 * ЧОГО ТУТ НЕМАЄ І ЧОМУ
 * Рахунку й статусів «Онлайн»/«Зіграний» у цій формі немає. Не через права:
 * рядки турнірної таблиці (`Table`) пише стара логіка Xano всередині
 * POST /match #4 і #5, і лише коли статус > 2, а етап типу «таблиця». CRM
 * пише матч власним ендпоінтом, тобто цієї логіки не виконує — і матч зі
 * статусом «Зіграний», створений звідси, не дав би жодного рядка таблиці.
 * Турнірна таблиця мовчки розійшлася б із результатами. Ведення рахунку —
 * черга 2 ТЗ (`docs/proposals/crm-admin-parity.md` у репозиторії AFU).
 *
 * Зіграні матчі тут видно повністю, з рахунком; недоступні рахунок, статус і
 * видалення (рішення Андрія 16.09). Перенести зіграний матч в інший турнір теж
 * не можна: `Table` тримає власний `leagues_id`, і рядки лишились би в старому.
 */

const дата = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** `datetime-local` розуміє лише «YYYY-MM-DDTHH:MM» у локальному часі. */
const доФорми = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const зафіксований = (m) => Number(m?.match_status_id) > 2;

export default function TournamentMatches({ tid, participants }) {
  const qc = useQueryClient();
  const [tour, setTour] = useState('');
  const [editing, setEditing] = useState(null);

  const matches = useQuery({
    queryKey: ['matches', tid, tour],
    queryFn: () => crm.get('/matches', { leagues_id: tid, tours_id: tour || undefined }),
  });
  const tours = useQuery({ queryKey: ['tours', tid], queryFn: () => crm.get(`/tournaments/${tid}/tours`) });
  // Аддона на Venues у Xano немає, тож назву арени підставляємо з довідника
  const venues = useQuery({ queryKey: ['venues'], queryFn: () => crm.get('/venues') });
  const аренаЗа = useMemo(() => Object.fromEntries((venues.data || []).map((v) => [v.id, v.City])), [venues.data]);

  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/matches/${v.id}`, v.data) : crm.post('/matches', v.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches', tid] });
      qc.invalidateQueries({ queryKey: ['tours', tid] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: ({ id, force }) => crm.del(`/matches/${id}${force ? '?force=true' : ''}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches', tid] });
      setEditing(null);
    },
  });

  const команди = useMemo(
    () =>
      (participants || [])
        .map((p) => ({ id: p.teaminfo_id, name: p._club?.TeamName || `Клуб ${p.teaminfo_id}` }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [participants]
  );

  return (
    <section>
      <div className="section-bar">
        <select value={tour} onChange={(e) => setTour(e.target.value)}>
          <option value="">Усі тури</option>
          {(tours.data || []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.TourName}
            </option>
          ))}
        </select>
        <span className="muted">Рахунок і статус «Зіграний» поки ставляться в ADMIN: від них залежать рядки таблиці</span>
        <button className="btn primary" onClick={() => setEditing({})} disabled={команди.length < 2 || !tours.data?.length}>
          Новий матч
        </button>
      </div>
      <ErrorBox error={matches.error} />
      {команди.length < 2 && <Empty>Спершу додайте щонайменше дві команди у вкладці «Учасники»</Empty>}
      {команди.length >= 2 && !tours.data?.length && <Empty>Спершу створіть тури у вкладці «Тури»</Empty>}
      {matches.data?.length === 0 && команди.length >= 2 && <Empty>Матчів ще немає</Empty>}
      {matches.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Коли</th>
              <th>Тур</th>
              <th>Матч</th>
              <th>Рахунок</th>
              <th>Арена</th>
              <th>Стан</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {matches.data.map((m) => (
              <tr key={m.id}>
                <td>{дата(m.TimeOfMatch)}</td>
                <td className="muted">{m._tour?.TourName || '—'}</td>
                <td>
                  <Link to={`/matches/${m.id}`} className="match-link">
                    <span className="strong">{m._team1?.TeamName || '—'}</span>
                    <span className="muted"> — </span>
                    <span className="strong">{m._team2?.TeamName || '—'}</span>
                  </Link>
                </td>
                <td>{зафіксований(m) ? `${m.Result_team1 ?? 0} : ${m.Result_team2 ?? 0}` : '—'}</td>
                <td className="muted">{аренаЗа[m.venues_id] || '—'}</td>
                <td>{m._status?.Status || '—'}</td>
                <td className="row-actions">
                  <Link className="btn small primary" to={`/matches/${m.id}`}>
                    Керувати матчем
                  </Link>
                  <button className="btn small" onClick={() => setEditing(m)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <MatchForm
          item={editing}
          tid={tid}
          tours={tours.data || []}
          команди={команди}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={remove}
        />
      )}
    </section>
  );
}

function MatchForm({ item, tid, tours, команди, onClose, onSave, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  // Залежності читаємо лише коли людина натиснула «Видалити»: до того це зайвий
  // запит на кожне відкриття картки.
  const deps = useQuery({
    queryKey: ['match-deps', item.id],
    queryFn: () => crm.get(`/matches/${item.id}/deps`),
    enabled: confirming && !!item.id,
  });
  const venues = useQuery({ queryKey: ['venues'], queryFn: () => crm.get('/venues') });
  const judges = useQuery({ queryKey: ['judges', false], queryFn: () => crm.get('/judges') });
  const delegates = useQuery({ queryKey: ['delegates'], queryFn: () => crm.get('/delegates') });
  const statuses = useQuery({ queryKey: ['match-statuses'], queryFn: () => crm.get('/match-statuses') });

  const fixed = зафіксований(item);
  const { values, set } = useForm({
    TimeOfMatch: доФорми(item.TimeOfMatch),
    team1_id: item.team1_id || '',
    team2_id: item.team2_id || '',
    tours_id: item.tours_id || '',
    venues_id: item.venues_id || '',
    match_status_id: item.match_status_id || 1,
    referee1_id: item.referee1_id || '',
    referee2_id: item.referee2_id || '',
    referee3_id: item.referee3_id || '',
    users_idDelegat: item.users_idDelegat || '',
    VideoID: item.VideoID || '',
    Sposterigach_ar: item.Sposterigach_ar || '',
    timekeeper: item.timekeeper || '',
    match_number: item.match_number ?? '',
    num_of_spectators: item.num_of_spectators ?? '',
  });

  const число = (v) => (v === '' || v == null ? undefined : Number(v));
  const submit = (e) => {
    e.preventDefault();
    const data = {
      TimeOfMatch: new Date(values.TimeOfMatch).getTime(),
      team1_id: Number(values.team1_id),
      team2_id: Number(values.team2_id),
      tours_id: Number(values.tours_id),
      venues_id: Number(values.venues_id),
      referee1_id: число(values.referee1_id),
      referee2_id: число(values.referee2_id),
      referee3_id: число(values.referee3_id),
      users_idDelegat: число(values.users_idDelegat),
      VideoID: values.VideoID.trim(),
      Sposterigach_ar: values.Sposterigach_ar.trim(),
      timekeeper: values.timekeeper.trim(),
      match_number: число(values.match_number),
      num_of_spectators: число(values.num_of_spectators),
    };
    // Статус зіграного матчу не чіпаємо взагалі — інакше ендпоінт відмовить,
    // і людина не зрозуміє, чому не зберігається правка відео чи глядачів.
    if (!fixed) data.match_status_id = Number(values.match_status_id);
    if (!item.id) data.leagues_id = tid;
    onSave.mutate({ id: item.id, data });
  };

  const суддя = (j) => [j.prizvushche, j.Name].filter(Boolean).join(' ');

  return (
    <Modal title={item.id ? 'Матч' : 'Новий матч'} onClose={onClose} width={640}>
      <form onSubmit={submit} className="form">
        {fixed && (
          <div className="muted small-text">
            Матч має статус «{item._status?.Status}». Рахунок, статус і видалення — в ADMIN: від них залежать рядки турнірної
            таблиці, а протокол не відновлюється. Решту полів тут змінювати можна.
          </div>
        )}
        <div className="row2">
          <Field label="Дата й час">
            <input type="datetime-local" value={values.TimeOfMatch} onChange={set('TimeOfMatch')} required autoFocus />
          </Field>
          <Field label="Тур">
            <select value={values.tours_id} onChange={set('tours_id')} required>
              <option value="">—</option>
              {tours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.TourName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Господарі">
            <select value={values.team1_id} onChange={set('team1_id')} required>
              <option value="">—</option>
              {команди.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Гості">
            <select value={values.team2_id} onChange={set('team2_id')} required>
              <option value="">—</option>
              {команди.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Арена">
            <select value={values.venues_id} onChange={set('venues_id')} required>
              <option value="">—</option>
              {(venues.data || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.City}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Статус">
            <select value={values.match_status_id} onChange={set('match_status_id')} disabled={fixed}>
              {(statuses.data || [])
                .filter((s) => fixed || s.id <= 2)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.Status}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Арбітр 1">
            <select value={values.referee1_id} onChange={set('referee1_id')}>
              <option value="">—</option>
              {(judges.data || []).map((j) => (
                <option key={j.id} value={j.id}>
                  {суддя(j)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Арбітр 2">
            <select value={values.referee2_id} onChange={set('referee2_id')}>
              <option value="">—</option>
              {(judges.data || []).map((j) => (
                <option key={j.id} value={j.id}>
                  {суддя(j)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Третій арбітр">
            <select value={values.referee3_id} onChange={set('referee3_id')}>
              <option value="">—</option>
              {(judges.data || []).map((j) => (
                <option key={j.id} value={j.id}>
                  {суддя(j)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Делегат">
            <select value={values.users_idDelegat} onChange={set('users_idDelegat')}>
              <option value="">—</option>
              {(delegates.data || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.Name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Спостерігач арбітражу">
            <input value={values.Sposterigach_ar} onChange={set('Sposterigach_ar')} />
          </Field>
          <Field label="Хронометрист">
            <input value={values.timekeeper} onChange={set('timekeeper')} />
          </Field>
        </div>
        <div className="row2">
          <Field label="Номер матчу">
            <input type="number" value={values.match_number} onChange={set('match_number')} />
          </Field>
          <Field label="Глядачів">
            <input type="number" value={values.num_of_spectators} onChange={set('num_of_spectators')} />
          </Field>
        </div>
        <Field label="Відео" hint="ID запису, як його зберігає ADMIN">
          <input value={values.VideoID} onChange={set('VideoID')} />
        </Field>
        {confirming && (
          <div className="danger-box">
            <div className="strong">Видалити матч назавжди?</div>
            {deps.isPending && <div className="muted small-text">Рахую, що зникне разом із ним…</div>}
            {deps.data && deps.data.total === 0 && (
              <div className="muted small-text">До матчу нічого не привʼязано — зникне лише сам матч.</div>
            )}
            {deps.data && deps.data.total > 0 && (
              <div className="small-text">
                Разом із матчем зникнуть, і відновити їх не можна:
                <ul>
                  {deps.data.table_rows > 0 && <li>рядків турнірної таблиці: {deps.data.table_rows}</li>}
                  {deps.data.events > 0 && <li>подій протоколу: {deps.data.events}</li>}
                  {deps.data.squad > 0 && <li>гравців у заявці: {deps.data.squad}</li>}
                  {deps.data.staff_squad > 0 && <li>штабу в заявці: {deps.data.staff_squad}</li>}
                  {deps.data.staff_cards > 0 && <li>карток штабу: {deps.data.staff_cards}</li>}
                  {deps.data.organization > 0 && <li>пунктів організації матчу: {deps.data.organization}</li>}
                  {deps.data.violations > 0 && <li>порушень: {deps.data.violations}</li>}
                  {deps.data.injuries > 0 && <li>травм: {deps.data.injuries}</li>}
                </ul>
              </div>
            )}
            <ErrorBox error={onDelete.error} />
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Ні, лишити
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={onDelete.isPending || deps.isPending}
                onClick={() => onDelete.mutate({ id: item.id, force: (deps.data?.total ?? 0) > 0 })}
              >
                Так, видалити
              </button>
            </div>
          </div>
        )}
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          {item.id && !fixed && !confirming && (
            <button type="button" className="btn danger ghost" onClick={() => setConfirming(true)}>
              Видалити матч
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
