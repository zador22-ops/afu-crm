import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Tabs, Toggle, personName, toInt, useForm } from '../components/ui.jsx';
import MatchSquad from './MatchSquad.jsx';
import MatchOrganization from './MatchOrganization.jsx';
import MatchReport from './MatchReport.jsx';

/**
 * Протокол матчу: події, рахунок, статус, фоли, хвилини перерв.
 *
 * РАХУНОК ТУТ НЕ ВВОДИТЬСЯ РУКАМИ — він рахується з подій, і так само
 * рахуються рядки турнірної таблиці (функція Xano «CRM table recalc»).
 * Виняток один: технічний результат, коли подій немає взагалі — тоді рахунок
 * вводиться в полях нижче й перерахунок його не чіпає.
 *
 * `Statistic.team_id` — це рядок складу (`Team.id`), а не гравець і не клуб.
 * Тому гравця вибираємо зі складу конкретного клубу, і сервер перевіряє, що
 * він належить одній із двох команд матчу.
 */

const ГОЛ = 1;
const КАРТКА = 2;

export default function MatchPage() {
  const { id } = useParams();
  const mid = Number(id);
  const qc = useQueryClient();

  const match = useQuery({ queryKey: ['match', mid], queryFn: () => crm.get(`/matches/${mid}`) });
  const events = useQuery({ queryKey: ['events', mid], queryFn: () => crm.get(`/matches/${mid}/events`) });
  const dicts = useQuery({ queryKey: ['event-dicts'], queryFn: () => crm.get('/event-dicts') });
  // Для шапки: без дати й арени сторінка керування матчем не дає зрозуміти,
  // що це за гра, — у турі таких пар може бути вісім.
  const venues = useQuery({ queryKey: ['venues'], queryFn: () => crm.get('/venues') });
  const m = match.data;

  const roster1 = useQuery({
    queryKey: ['roster', m?.team1_id],
    queryFn: () => crm.get(`/clubs/${m.team1_id}/roster`),
    enabled: !!m?.team1_id,
  });
  const roster2 = useQuery({
    queryKey: ['roster', m?.team2_id],
    queryFn: () => crm.get(`/clubs/${m.team2_id}/roster`),
    enabled: !!m?.team2_id,
  });

  const staffCards = useQuery({ queryKey: ['staff-cards', mid], queryFn: () => crm.get(`/matches/${mid}/staff-cards`) });
  const staff1 = useQuery({
    queryKey: ['staff', m?.team1_id],
    queryFn: () => crm.get(`/clubs/${m.team1_id}/staff`),
    enabled: !!m?.team1_id,
  });
  const staff2 = useQuery({
    queryKey: ['staff', m?.team2_id],
    queryFn: () => crm.get(`/clubs/${m.team2_id}/staff`),
    enabled: !!m?.team2_id,
  });

  const [tab, setTab] = useState('protocol');
  const [cardEditing, setCardEditing] = useState(null);
  const [adding, setAdding] = useState(null);
  const оновити = () => {
    qc.invalidateQueries({ queryKey: ['events', mid] });
    qc.invalidateQueries({ queryKey: ['staff-cards', mid] });
    qc.invalidateQueries({ queryKey: ['match', mid] });
    qc.invalidateQueries({ queryKey: ['matches'] });
  };

  // Одна мутація на створення й правку: ADMIN уміє редагувати подію
  // (StatisticEDIT), і без цього виправити хвилину чи тип гола можна було б
  // тільки знявши подію й завівши наново — а зняття гола перераховує таблицю.
  const saveEvent = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/events/${v.id}`, v.body) : crm.post(`/matches/${mid}/events`, v.body)),
    onSuccess: () => {
      оновити();
      setAdding(null);
    },
  });
  const saveCard = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/staff-cards/${v.id}`, v.body) : crm.post(`/matches/${mid}/staff-cards`, v.body)),
    onSuccess: () => {
      оновити();
      setCardEditing(null);
    },
  });
  const delCard = useMutation({ mutationFn: (cid) => crm.del(`/staff-cards/${cid}`), onSuccess: оновити });
  const delEvent = useMutation({ mutationFn: (eid) => crm.del(`/events/${eid}`), onSuccess: оновити });
  const saveResult = useMutation({ mutationFn: (body) => crm.post(`/matches/${mid}/result`, body), onSuccess: оновити });
  // Сповіщення про хід матчу: гол і картка летять самі при записі події, а
  // кінець тайму й початок другого треба натиснути — у базі це окремі рядки
  // «finish first half» і «start second half», інших вона не знає.
  const notify = useMutation({ mutationFn: (type_of_event) => crm.post(`/matches/${mid}/notify`, { type_of_event }) });

  const склад = useMemo(() => {
    const за = {};
    for (const r of roster1.data || []) за[r.id] = { ...r, teaminfo_id: m?.team1_id };
    for (const r of roster2.data || []) за[r.id] = { ...r, teaminfo_id: m?.team2_id };
    return за;
  }, [roster1.data, roster2.data, m]);

  const гравець = (teamRowId) => {
    const r = склад[teamRowId];
    if (!r) return teamRowId ? `#${teamRowId}` : '—';
    return `${r.Number ? `${r.Number}. ` : ''}${personName(r._people) || `гравець ${r.player_id}`}`;
  };

  if (match.isPending) return <div className="center muted">Завантаження…</div>;
  if (match.error) return <div className="page"><ErrorBox error={match.error} /></div>;

  const зіграний = Number(m.match_status_id) > 2;

  return (
    <div className="page">
      <PageHeader
        back={
          <Link to={`/tournaments/${m.leagues_id}`} className="back">
            ← Турнір
          </Link>
        }
        title={
          <span>
            {m._team1?.TeamName} <span className="muted">—</span> {m._team2?.TeamName}
          </span>
        }
        subtitle={[
          m.TimeOfMatch ? new Date(m.TimeOfMatch).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
          m._tour?.TourName,
          (venues.data || []).find((v) => v.id === m.venues_id)?.City,
          m._status?.Status,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <span className="score-big">
            {m.Result_team1 ?? 0} : {m.Result_team2 ?? 0}
          </span>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'protocol', label: 'Протокол', count: events.data?.length },
          { key: 'squad', label: 'Заявка' },
          { key: 'org', label: 'Організація' },
          { key: 'report', label: 'Рапорт' },
        ]}
      />
      {tab === 'squad' && <MatchSquad match={m} />}
      {tab === 'org' && <MatchOrganization matchId={mid} />}
      {tab === 'report' && <MatchReport match={m} />}
      {tab === 'protocol' && (
      <>
      <section className="card-form">
        <h3>Хід матчу</h3>
        <ResultForm match={m} onSave={saveResult} подій={events.data?.length ?? 0} />
        <div className="section-bar">
          <span className="muted">
            {Number(m.match_status_id) === 3
              ? 'Сповіщення підуть уболівальникам, які стежать за матчем, гравцем або однією з команд'
              : 'Сповіщення доступні лише в матчі зі статусом «Онлайн»'}
          </span>
          <button
            className="btn"
            disabled={Number(m.match_status_id) !== 3 || notify.isPending}
            onClick={() => notify.mutate('finish first half')}
          >
            Кінець 1-го тайму
          </button>
          <button
            className="btn"
            disabled={Number(m.match_status_id) !== 3 || notify.isPending}
            onClick={() => notify.mutate('start second half')}
          >
            Початок 2-го тайму
          </button>
          {notify.isSuccess && <span className="muted small-text">надіслано</span>}
        </div>
        <ErrorBox error={notify.error} />
      </section>

      <section>
        <div className="section-bar">
          <h3>Події</h3>
          <span className="muted">
            Рахунок рахується з подій, і разом із ним — рядки турнірної таблиці. Автогол зараховується суперникові
          </span>
          <button className="btn primary" onClick={() => setAdding({ team: m.team1_id })} disabled={!dicts.data}>
            Додати подію
          </button>
        </div>
        <ErrorBox error={events.error || delEvent.error} />
        {events.data?.length === 0 && <Empty>Подій ще немає</Empty>}
        {events.data?.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Хв</th>
                <th>Команда</th>
                <th>Подія</th>
                <th>Гравець</th>
                <th>Деталі</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.data.map((e) => (
                <tr key={e.id}>
                  <td>{e.minute ?? '—'}</td>
                  <td className="muted">
                    {e._team?.teaminfo_id === m.team1_id ? m._team1?.TeamName : e._team?.teaminfo_id === m.team2_id ? m._team2?.TeamName : '—'}
                  </td>
                  <td className="strong">{e._event?.Event || '—'}</td>
                  <td>{гравець(e.team_id)}</td>
                  <td className="muted">
                    {e._goal?.Type}
                    {e.asustent_team_id ? ` · асист: ${гравець(e.asustent_team_id)}` : ''}
                    {e._card?.Type}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => setAdding(e)}>
                      Змінити
                    </button>
                    <button className="btn small danger ghost" onClick={() => delEvent.mutate(e.id)} disabled={delEvent.isPending}>
                      Зняти
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="section-bar">
          <h3>Картки штабу</h3>
          <span className="muted">
            Тренери й адміністратори — окремо від гравців: на рахунок і таблицю такі картки не впливають
          </span>
          <button
            className="btn primary"
            onClick={() => setCardEditing({})}
            disabled={!dicts.data || (!staff1.data?.length && !staff2.data?.length)}
          >
            Додати картку
          </button>
        </div>
        <ErrorBox error={staffCards.error || delCard.error} />
        {staffCards.data?.length === 0 && <Empty>Карток штабу немає</Empty>}
        {staffCards.data?.length > 0 && (
          <table className="table compact">
            <tbody>
              {staffCards.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.minute ?? '—'}</td>
                  <td className="muted">
                    {c._staff?.teaminfo_id === m.team1_id ? m._team1?.TeamName : m._team2?.TeamName}
                  </td>
                  <td className="strong">{personName(c._staff?._people) || `особа ${c._staff?.people_id}`}</td>
                  <td className="muted">{c._staff?._position?.Position || ''}</td>
                  <td>{c._card?.Type || '—'}</td>
                  <td className="row-actions">
                    <button className="btn small" onClick={() => setCardEditing(c)}>
                      Змінити
                    </button>
                    <button className="btn small danger ghost" onClick={() => delCard.mutate(c.id)} disabled={delCard.isPending}>
                      Зняти
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      </>
      )}
      {cardEditing && (
        <StaffCardForm
          match={m}
          dicts={dicts.data}
          staff1={staff1.data || []}
          staff2={staff2.data || []}
          item={cardEditing.id ? cardEditing : null}
          onClose={() => setCardEditing(null)}
          onSave={saveCard}
        />
      )}
      {adding && (
        <EventForm
          match={m}
          dicts={dicts.data}
          roster1={roster1.data || []}
          roster2={roster2.data || []}
          item={adding?.id ? adding : null}
          onClose={() => setAdding(null)}
          onSave={saveEvent}
        />
      )}
      {зіграний && events.data?.length === 0 && (
        <div className="muted small-text">
          Подій немає — матч рахується технічним, і рахунок береться з полів вище.
        </div>
      )}
    </div>
  );
}

function ResultForm({ match, onSave, подій }) {
  const { values, set } = useForm({
    match_status_id: match.match_status_id > 2 ? match.match_status_id : 4,
    fouls1_team1: !!match.fouls1_team1,
    fouls2_team1: !!match.fouls2_team1,
    fouls1_team2: !!match.fouls1_team2,
    fouls2_team2: !!match.fouls2_team2,
    minute_break_1_1: match.minute_break_1_1 ?? '',
    minute_break_1_2: match.minute_break_1_2 ?? '',
    minute_break_2_1: match.minute_break_2_1 ?? '',
    minute_break_2_2: match.minute_break_2_2 ?? '',
    Result_team1: match.Result_team1 ?? 0,
    Result_team2: match.Result_team2 ?? 0,
    other_comments: match.other_comments || '',
  });
  const технічний = подій === 0;
  const submit = (e) => {
    e.preventDefault();
    const body = {
      match_status_id: Number(values.match_status_id),
      fouls1_team1: values.fouls1_team1,
      fouls2_team1: values.fouls2_team1,
      fouls1_team2: values.fouls1_team2,
      fouls2_team2: values.fouls2_team2,
      minute_break_1_1: toInt(values.minute_break_1_1) ?? 0,
      minute_break_1_2: toInt(values.minute_break_1_2) ?? 0,
      minute_break_2_1: toInt(values.minute_break_2_1) ?? 0,
      minute_break_2_2: toInt(values.minute_break_2_2) ?? 0,
      other_comments: values.other_comments.trim(),
    };
    // Рахунок шлемо лише коли подій немає: інакше сервер усе одно порахує з
    // подій, а поле в формі створювало б враження, що його можна переписати.
    if (технічний) {
      body.Result_team1 = toInt(values.Result_team1) ?? 0;
      body.Result_team2 = toInt(values.Result_team2) ?? 0;
    }
    onSave.mutate(body);
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="row2">
        <Field label="Статус">
          <select value={values.match_status_id} onChange={set('match_status_id')}>
            <option value={3}>Онлайн</option>
            <option value={4}>Зіграний</option>
          </select>
        </Field>
        <Field label="Коментар до матчу">
          <input value={values.other_comments} onChange={set('other_comments')} />
        </Field>
      </div>
      {технічний && (
        <div className="row2">
          <Field label="Рахунок господарів" hint="Технічний результат: подій у матчі немає">
            <input type="number" value={values.Result_team1} onChange={set('Result_team1')} />
          </Field>
          <Field label="Рахунок гостей">
            <input type="number" value={values.Result_team2} onChange={set('Result_team2')} />
          </Field>
        </div>
      )}
      <div className="row2">
        <Field label="Пʼять фолів, господарі" hint="Прапорець на кожен тайм, а не кількість фолів">
          <div className="club-cell">
            <Toggle checked={values.fouls1_team1} onChange={set('fouls1_team1')} label="1-й тайм" />
            <Toggle checked={values.fouls2_team1} onChange={set('fouls2_team1')} label="2-й тайм" />
          </div>
        </Field>
        <Field label="Пʼять фолів, гості">
          <div className="club-cell">
            <Toggle checked={values.fouls1_team2} onChange={set('fouls1_team2')} label="1-й тайм" />
            <Toggle checked={values.fouls2_team2} onChange={set('fouls2_team2')} label="2-й тайм" />
          </div>
        </Field>
      </div>
      <div className="row2">
        <Field label="Перерви, 1-й тайм" hint="Хвилини тайм-аутів">
          <div className="club-cell">
            <input type="number" value={values.minute_break_1_1} onChange={set('minute_break_1_1')} />
            <input type="number" value={values.minute_break_1_2} onChange={set('minute_break_1_2')} />
          </div>
        </Field>
        <Field label="Перерви, 2-й тайм">
          <div className="club-cell">
            <input type="number" value={values.minute_break_2_1} onChange={set('minute_break_2_1')} />
            <input type="number" value={values.minute_break_2_2} onChange={set('minute_break_2_2')} />
          </div>
        </Field>
      </div>
      <ErrorBox error={onSave.error} />
      <div className="form-actions">
        <button className="btn primary" disabled={onSave.isPending}>
          Зберегти хід матчу
        </button>
      </div>
    </form>
  );
}

function EventForm({ match, dicts, roster1, roster2, item, onClose, onSave }) {
  const { values, set } = useForm({
    сторона: String(item?._team?.teaminfo_id || match.team1_id),
    types_of_match_events_id: item?.types_of_match_events_id ?? ГОЛ,
    team_id: item?.team_id ?? '',
    minute: item?.minute ?? '',
    types_of_goals_id: item?.types_of_goals_id || 1,
    types_of_cards_id: item?.types_of_cards_id || 2,
    asustent_team_id: item?.asustent_team_id || '',
    reason: item?.reason || '',
  });
  const свої = String(values.сторона) === String(match.team1_id) ? roster1 : roster2;
  const активні = свої.filter((r) => r.Relevance_of_the_record);
  const тип = Number(values.types_of_match_events_id);

  const submit = (e) => {
    e.preventDefault();
    const body = {
      types_of_match_events_id: тип,
      team_id: Number(values.team_id),
      minute: toInt(values.minute) ?? 0,
    };
    if (тип === ГОЛ) {
      body.types_of_goals_id = Number(values.types_of_goals_id);
      if (values.asustent_team_id) body.asustent_team_id = Number(values.asustent_team_id);
    }
    if (тип === КАРТКА) {
      body.types_of_cards_id = Number(values.types_of_cards_id);
      if (values.reason.trim()) body.reason = values.reason.trim();
    }
    onSave.mutate({ id: item?.id, body });
  };

  const підпис = (r) => `${r.Number ? `${r.Number}. ` : ''}${personName(r._people) || `гравець ${r.player_id}`}`;

  return (
    <Modal title={item ? 'Змінити подію' : 'Подія матчу'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row2">
          <Field label="Команда">
            <select
              value={values.сторона}
              onChange={(e) => {
                set('сторона')(e);
                set('team_id')({ target: { value: '' } });
                set('asustent_team_id')({ target: { value: '' } });
              }}
            >
              <option value={match.team1_id}>{match._team1?.TeamName}</option>
              <option value={match.team2_id}>{match._team2?.TeamName}</option>
            </select>
          </Field>
          <Field label="Хвилина">
            <input type="number" value={values.minute} onChange={set('minute')} />
          </Field>
        </div>
        <Field label="Подія">
          <select value={values.types_of_match_events_id} onChange={set('types_of_match_events_id')}>
            {(dicts?.events || []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.Event}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Гравець">
          <select value={values.team_id} onChange={set('team_id')} required>
            <option value="">—</option>
            {активні.map((r) => (
              <option key={r.id} value={r.id}>
                {підпис(r)}
              </option>
            ))}
          </select>
        </Field>
        {тип === ГОЛ && (
          <div className="row2">
            <Field label="Тип гола" hint="Автогол зараховується суперникові">
              <select value={values.types_of_goals_id} onChange={set('types_of_goals_id')}>
                {(dicts?.goals || []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.Type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Асист">
              <select value={values.asustent_team_id} onChange={set('asustent_team_id')}>
                <option value="">—</option>
                {активні
                  .filter((r) => String(r.id) !== String(values.team_id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {підпис(r)}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        )}
        {тип === КАРТКА && (
          <div className="row2">
            <Field label="Картка">
              <select value={values.types_of_cards_id} onChange={set('types_of_cards_id')}>
                {(dicts?.cards || []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.Type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Причина">
              <input value={values.reason} onChange={set('reason')} />
            </Field>
          </div>
        )}
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending}>
            {item ? 'Зберегти' : 'Додати'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Картка тренерові або адміністратору. Окремо від подій гравців, бо в базі це
 * інша таблиця й на рахунок вона не впливає.
 *
 * Сповіщення при додаванні йде тією ж функцією, що й для гравців, але з
 * міткою `minute: 1001` — за нею вона шукає людину в штабі, а не у складі.
 * Мітку ставить сервер, тут її немає й бути не повинно.
 */
function StaffCardForm({ match, dicts, staff1, staff2, item, onClose, onSave }) {
  const { values, set } = useForm({
    сторона: String(item?._staff?.teaminfo_id || match.team1_id),
    administration_of_teams_id: item?.administration_of_teams_id ?? '',
    types_of_cards_id: item?.types_of_cards_id || 2,
    minute: item?.minute ?? '',
  });
  const свої = String(values.сторона) === String(match.team1_id) ? staff1 : staff2;
  const активні = свої.filter((s) => s.Relevance_of_the_record !== false);

  const submit = (e) => {
    e.preventDefault();
    const body = {
      types_of_cards_id: Number(values.types_of_cards_id),
      minute: toInt(values.minute) ?? 0,
    };
    // Людину при правці не міняємо: картка вже привʼязана, а зміна особи —
    // це інша картка. Інакше в протоколі тихо підміниться, кому її показали.
    if (!item) body.administration_of_teams_id = Number(values.administration_of_teams_id);
    onSave.mutate({ id: item?.id, body });
  };

  return (
    <Modal title={item ? 'Змінити картку штабу' : 'Картка штабу'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {!item && (
          <>
            <Field label="Команда">
              <select
                value={values.сторона}
                onChange={(e) => {
                  set('сторона')(e);
                  set('administration_of_teams_id')({ target: { value: '' } });
                }}
              >
                <option value={match.team1_id}>{match._team1?.TeamName}</option>
                <option value={match.team2_id}>{match._team2?.TeamName}</option>
              </select>
            </Field>
            <Field label="Хто">
              <select value={values.administration_of_teams_id} onChange={set('administration_of_teams_id')} required>
                <option value="">—</option>
                {активні.map((s) => (
                  <option key={s.id} value={s.id}>
                    {personName(s._people) || `особа ${s.people_id}`}
                    {s._positions?.Position ? ` · ${s._positions.Position}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {item && (
          <div className="muted small-text">
            {personName(item._staff?._people)} · {item._staff?._position?.Position || ''} — кому показано картку, тут не
            змінюється
          </div>
        )}
        <div className="row2">
          <Field label="Картка">
            <select value={values.types_of_cards_id} onChange={set('types_of_cards_id')}>
              {(dicts?.cards || []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.Type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Хвилина">
            <input type="number" value={values.minute} onChange={set('minute')} />
          </Field>
        </div>
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending}>
            {item ? 'Зберегти' : 'Додати'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
