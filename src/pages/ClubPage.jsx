import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Tabs, Toggle, dayBefore, fmtDate, personName, toInt, today, useForm } from '../components/ui.jsx';
import { PersonForm, PersonPicker } from './PeoplePage.jsx';
import PhotoCropper from '../components/PhotoCropper.jsx';

export default function ClubPage() {
  const { id } = useParams();
  const cid = Number(id);
  const [tab, setTab] = useState('card');
  const club = useQuery({ queryKey: ['club', cid], queryFn: () => crm.get(`/clubs/${cid}`) });
  const c = club.data?.club;

  return (
    <div className="page">
      <PageHeader
        back={
          <Link to="/clubs" className="back">
            ← Клуби
          </Link>
        }
        title={
          <span className="club-cell">
            {c?.TeamLogo?.url && <img src={c.TeamLogo.url} alt="" className="logo-md" />}
            {c?.TeamName || 'Клуб'}
            {c && !c.Relevance && <span className="badge warn">архів</span>}
          </span>
        }
        subtitle={c?.TeamInfo}
      />
      <ErrorBox error={club.error} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'card', label: 'Картка' },
          { key: 'roster', label: 'Склад', count: club.data?.roster_count },
          { key: 'staff', label: 'Штаб', count: club.data?.staff_count },
          { key: 'tournaments', label: 'Турніри', count: club.data?.participations?.length },
        ]}
      />
      {c && tab === 'card' && <Card data={club.data} />}
      {c && tab === 'roster' && <Roster club={c} participations={club.data.participations} />}
      {c && tab === 'staff' && <Staff club={c} />}
      {c && tab === 'tournaments' && <Participations data={club.data} />}
    </div>
  );
}

function Card({ data }) {
  const qc = useQueryClient();
  const c = data.club;
  const clubs = useQuery({ queryKey: ['clubs', true], queryFn: () => crm.get('/clubs', { archived: true }) });
  const dicts = useQuery({ queryKey: ['dicts'], queryFn: () => crm.get('/positions') });
  const { values, set, setValues } = useForm(toForm(c));
  useEffect(() => setValues(toForm(c)), [c, setValues]);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      crm.patch(`/clubs/${c.id}`, {
        TeamName: values.TeamName.trim(),
        TeamInfo: values.TeamInfo.trim(),
        Relevance: values.Relevance,
        parent_teaminfo_id: toInt(values.parent_teaminfo_id) ?? 0,
        founded_year: toInt(values.founded_year) ?? 0,
        home_venues_id: toInt(values.home_venues_id) ?? 0,
        website: values.website.trim(),
        instagram: values.instagram.trim(),
        facebook: values.facebook.trim(),
        youtube: values.youtube.trim(),
        colors: values.colors.trim(),
        contact_name: values.contact_name.trim(),
        contact_phone: values.contact_phone.trim(),
        contact_email: values.contact_email.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['club', c.id] });
      qc.invalidateQueries({ queryKey: ['clubs'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });
  const upload = useMutation({
    mutationFn: ({ kind, file }) => {
      const form = new FormData();
      form.append('kind', kind);
      form.append('image', file);
      return crm.upload(`/clubs/${c.id}/image`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['club', c.id] });
      qc.invalidateQueries({ queryKey: ['clubs'] });
    },
  });

  const parents = (clubs.data || []).filter((x) => x.id !== c.id);

  return (
    <form
      className="form card-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="card-grid">
        <section className="card-col">
          <h3>Основне</h3>
          <Field label="Назва">
            <input value={values.TeamName} onChange={set('TeamName')} required />
          </Field>
          <Field label="Місто">
            <input value={values.TeamInfo} onChange={set('TeamInfo')} />
          </Field>
          <div className="row2">
            <Field label="Рік заснування">
              <input type="number" value={values.founded_year} onChange={set('founded_year')} />
            </Field>
            <Field label="Домашня арена">
              <select value={values.home_venues_id} onChange={set('home_venues_id')}>
                <option value="">—</option>
                {(dicts.data?.venues || []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.City}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="Материнський клуб"
            hint="Для другої команди (СкайАп-2 → СкайАп). Гравець може бути одночасно в чинному складі лише споріднених клубів"
          >
            <select value={values.parent_teaminfo_id} onChange={set('parent_teaminfo_id')}>
              <option value="">— немає, це самостійний клуб</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.TeamName}
                </option>
              ))}
            </select>
          </Field>
          {data.children?.length > 0 && (
            <div className="muted small-text">
              Дочірні клуби:{' '}
              {data.children.map((ch, i) => (
                <span key={ch.id}>
                  {i > 0 && ', '}
                  <Link to={`/clubs/${ch.id}`}>{ch.TeamName}</Link>
                </span>
              ))}
            </div>
          )}
          <Field label="Кольори">
            <input value={values.colors} onChange={set('colors')} placeholder="синій, білий" />
          </Field>
          <Toggle checked={values.Relevance} onChange={set('Relevance')} label="Активний клуб (в архіві не показується в списках ADMIN і застосунку)" />
        </section>

        <section className="card-col">
          <h3>Контакти й мережі</h3>
          <Field label="Контактна особа">
            <input value={values.contact_name} onChange={set('contact_name')} />
          </Field>
          <div className="row2">
            <Field label="Телефон">
              <input value={values.contact_phone} onChange={set('contact_phone')} />
            </Field>
            <Field label="Email">
              <input type="email" value={values.contact_email} onChange={set('contact_email')} />
            </Field>
          </div>
          <Field label="Сайт">
            <input value={values.website} onChange={set('website')} placeholder="https://" />
          </Field>
          <Field label="Instagram">
            <input value={values.instagram} onChange={set('instagram')} />
          </Field>
          <Field label="Facebook">
            <input value={values.facebook} onChange={set('facebook')} />
          </Field>
          <Field label="YouTube">
            <input value={values.youtube} onChange={set('youtube')} />
          </Field>
        </section>

        <section className="card-col">
          <h3>Зображення</h3>
          <ImageSlot
            label="Логотип"
            url={c.TeamLogo?.url}
            onFile={(file) => upload.mutate({ kind: 'logo', file })}
            busy={upload.isPending}
            кадрувати
          />
          <ImageSlot label="Фото команди" url={c.TeamPhoto?.url} onFile={(file) => upload.mutate({ kind: 'photo', file })} busy={upload.isPending} wide />
          <ErrorBox error={upload.error} />
        </section>
      </div>
      <ErrorBox error={save.error} />
      <div className="form-actions sticky">
        {saved && <span className="ok">Збережено</span>}
        <button className="btn primary" disabled={save.isPending}>
          Зберегти картку
        </button>
      </div>
    </form>
  );
}

const toForm = (c) => ({
  TeamName: c.TeamName || '',
  TeamInfo: c.TeamInfo || '',
  Relevance: !!c.Relevance,
  parent_teaminfo_id: c.parent_teaminfo_id || '',
  founded_year: c.founded_year || '',
  home_venues_id: c.home_venues_id || '',
  website: c.website || '',
  instagram: c.instagram || '',
  facebook: c.facebook || '',
  youtube: c.youtube || '',
  colors: c.colors || '',
  contact_name: c.contact_name || '',
  contact_phone: c.contact_phone || '',
  contact_email: c.contact_email || '',
});

function ImageSlot({ label, url, onFile, busy, wide, кадрувати }) {
  // Файл не відправляємо одразу: спершу показуємо кадр. Для широкого фото
  // команди кадрування нема сенсу — квадрат зʼїв би половину шеренги.
  const [файл, setФайл] = useState(null);
  const [кадруємо, setКадруємо] = useState(false);
  return (
    <div className="image-slot">
      <div className="field-label">{label}</div>
      {url ? <img src={url} alt="" className={wide ? 'img-wide' : 'img-logo'} /> : <div className={`img-empty ${wide ? 'wide' : ''}`}>немає</div>}
      <div className="club-cell">
        <label className="btn small file-btn">
          {busy ? 'Завантажуємо…' : url ? 'Замінити' : 'Завантажити'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (кадрувати) {
                setФайл(f);
                setКадруємо(true);
              } else {
                onFile(f);
              }
            }}
          />
        </label>
        {кадрувати && url && (
          <button type="button" className="btn small" onClick={() => setКадруємо(true)} disabled={busy}>
            Кадрувати
          </button>
        )}
      </div>
      {кадруємо && (
        <PhotoCropper
          file={файл}
          url={!файл ? url : undefined}
          прозоро
          onClose={() => {
            setКадруємо(false);
            setФайл(null);
          }}
          onDone={(blob) => {
            onFile(new File([blob], 'logo.png', { type: 'image/png' }));
            setКадруємо(false);
            setФайл(null);
          }}
        />
      )}
    </div>
  );
}

function Roster({ club, participations }) {
  const qc = useQueryClient();
  const [leagues_id, setLeague] = useState('');
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(null);
  const [editing, setEditing] = useState(null);
  const roster = useQuery({
    queryKey: ['roster', club.id, leagues_id, all],
    queryFn: () => crm.get(`/clubs/${club.id}/roster`, { leagues_id: leagues_id || undefined, all }),
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['roster', club.id] });
    qc.invalidateQueries({ queryKey: ['club', club.id] });
  };
  const close = useMutation({
    mutationFn: ({ id, End_date }) => crm.post(`/roster/${id}/close`, { End_date }),
    onSuccess: () => {
      invalidate();
      setClosing(null);
    },
  });

  return (
    <section>
      <div className="section-bar">
        <div className="filters">
          <select value={leagues_id} onChange={(e) => setLeague(e.target.value)}>
            <option value="">Усі турніри</option>
            {participations.map((p) => (
              <option key={p.id} value={p.leagues_id}>
                {p._leagues?.League || `Турнір #${p.leagues_id}`}
              </option>
            ))}
          </select>
          <Toggle checked={all} onChange={setAll} label="Показати й тих, хто пішов" />
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>
          Заявити гравця
        </button>
      </div>
      <ErrorBox error={roster.error || close.error} />
      {roster.data?.length === 0 && <Empty>У складі нікого немає</Empty>}
      {roster.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>№</th>
              <th>Гравець</th>
              <th>Амплуа</th>
              <th>Турнір</th>
              <th>Заявлений</th>
              <th>Вибув</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roster.data.map((r) => (
              <tr key={r.id} className={r.Relevance_of_the_record ? '' : 'muted'}>
                <td className="num">{r.Number || '—'}</td>
                <td className="club-cell">
                  {r._people?.Photo?.url ? <img src={r._people.Photo.url} alt="" className="avatar" /> : <span className="avatar placeholder" />}
                  <span className="strong">{personName(r._people)}</span>
                  {r.Captain && <span className="badge">капітан</span>}
                </td>
                <td>{r._positions?.Position || '—'}</td>
                <td className="muted">{r._leagues?.League || `#${r.leagues_id}`}</td>
                <td>{fmtDate(r.Date)}</td>
                <td>{r.End_date ? fmtDate(r.End_date) : r.Relevance_of_the_record ? <span className="ok">грає</span> : '—'}</td>
                <td className="row-actions">
                  {r.Relevance_of_the_record && (
                    <>
                      <button className="btn small" onClick={() => setEditing(r)}>
                        Змінити
                      </button>
                      <button className="btn small danger" onClick={() => setClosing(r)}>
                        Закрити
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <AddPlayer club={club} participations={participations} defaultLeague={leagues_id} onClose={() => setAdding(false)} onDone={invalidate} />}
      {editing && <EditRosterRow row={editing} onClose={() => setEditing(null)} onDone={invalidate} />}
      {closing && (
        <CloseDialog
          title={`Закрити заявку: ${personName(closing._people)}`}
          hint="Рядок не видаляється: він лишається в історії гравця з датою вибуття"
          onClose={() => setClosing(null)}
          onConfirm={(d) => close.mutate({ id: closing.id, End_date: d })}
          error={close.error}
          busy={close.isPending}
        />
      )}
    </section>
  );
}

function AddPlayer({ club, participations, defaultLeague, onClose, onDone }) {
  const dicts = useQuery({ queryKey: ['dicts'], queryFn: () => crm.get('/positions') });
  const [person, setPerson] = useState(null);
  const [creating, setCreating] = useState(false);
  const { values, set } = useForm({
    leagues_id: defaultLeague || participations[0]?.leagues_id || '',
    Number: '',
    positions_id: '',
    Captain: false,
    Date: today(),
  });
  const add = useMutation({
    mutationFn: () =>
      crm.post('/roster/add', {
        player_id: person.id,
        teaminfo_id: club.id,
        leagues_id: Number(values.leagues_id),
        Number: toInt(values.Number) ?? 0,
        positions_id: Number(values.positions_id),
        Captain: values.Captain,
        Date: values.Date,
        prev_end_date: dayBefore(values.Date),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const playerPositions = (dicts.data?.positions || []).filter((p) => p.Player_position);

  return (
    <Modal title={`Заявити гравця в ${club.TeamName}`} onClose={onClose} width={640}>
      {creating && <PersonForm person={{}} onClose={() => setCreating(false)} onCreated={(p) => setPerson(p)} />}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <PersonPicker value={person} onChange={setPerson} onCreate={() => setCreating(true)} />
        <div className="row2">
          <Field label="Турнір (сезон)">
            <select value={values.leagues_id} onChange={set('leagues_id')} required>
              <option value="">—</option>
              {participations.map((p) => (
                <option key={p.id} value={p.leagues_id}>
                  {p._leagues?.League || `Турнір #${p.leagues_id}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Амплуа">
            <select value={values.positions_id} onChange={set('positions_id')} required>
              <option value="">—</option>
              {playerPositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.Position}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row2">
          <Field label="Ігровий номер">
            <input type="number" min="0" max="99" value={values.Number} onChange={set('Number')} />
          </Field>
          <Field label="Дата заявки">
            <input type="date" value={values.Date} onChange={set('Date')} required />
          </Field>
        </div>
        <Toggle checked={values.Captain} onChange={set('Captain')} label="Капітан" />
        <p className="muted small-text">
          Чинна заявка гравця в іншому, неспорідненому клубі закриється датою {fmtDate(dayBefore(values.Date))}. У материнському або дочірньому
          клубі заявка лишиться паралельною.
        </p>
        {participations.length === 0 && <div className="error-box">Клуб не бере участі в жодному турнірі. Спершу додайте його в турнір.</div>}
        <ErrorBox error={add.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={!person || !values.leagues_id || !values.positions_id || add.isPending}>
            Заявити
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditRosterRow({ row, onClose, onDone }) {
  const dicts = useQuery({ queryKey: ['dicts'], queryFn: () => crm.get('/positions') });
  const { values, set } = useForm({ Number: row.Number ?? '', positions_id: row.positions_id || '', Captain: !!row.Captain });
  const save = useMutation({
    mutationFn: () =>
      crm.patch(`/roster/${row.id}`, { Number: toInt(values.Number) ?? 0, positions_id: Number(values.positions_id), Captain: values.Captain }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={personName(row._people)} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="row2">
          <Field label="Ігровий номер">
            <input type="number" min="0" max="99" value={values.Number} onChange={set('Number')} autoFocus />
          </Field>
          <Field label="Амплуа">
            <select value={values.positions_id} onChange={set('positions_id')}>
              {(dicts.data?.positions || [])
                .filter((p) => p.Player_position)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.Position}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Toggle checked={values.Captain} onChange={set('Captain')} label="Капітан" />
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={save.isPending}>
            Зберегти
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CloseDialog({ title, hint, onClose, onConfirm, error, busy }) {
  const [d, setD] = useState(today());
  return (
    <Modal title={title} onClose={onClose} width={420}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(d);
        }}
      >
        <Field label="Дата вибуття" hint={hint}>
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} required autoFocus />
        </Field>
        <ErrorBox error={error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn danger" disabled={busy}>
            Закрити заявку
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Staff({ club }) {
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(null);
  const staff = useQuery({ queryKey: ['staff', club.id, all], queryFn: () => crm.get(`/clubs/${club.id}/staff`, { all }) });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staff', club.id] });
    qc.invalidateQueries({ queryKey: ['club', club.id] });
  };
  const close = useMutation({
    mutationFn: ({ id, end_date }) => crm.post(`/staff/${id}/close`, { end_date }),
    onSuccess: () => {
      invalidate();
      setClosing(null);
    },
  });
  return (
    <section>
      <div className="section-bar">
        <Toggle checked={all} onChange={setAll} label="Показати й колишніх" />
        <button className="btn primary" onClick={() => setAdding(true)}>
          Додати в штаб
        </button>
      </div>
      <ErrorBox error={staff.error || close.error} />
      {staff.data?.length === 0 && <Empty>Штаб порожній</Empty>}
      {staff.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Особа</th>
              <th>Посада</th>
              <th>З</th>
              <th>По</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {staff.data.map((r) => (
              <tr key={r.id} className={r.Relevance_of_the_record ? '' : 'muted'}>
                <td className="club-cell">
                  {r._people?.Photo?.url ? <img src={r._people.Photo.url} alt="" className="avatar" /> : <span className="avatar placeholder" />}
                  <span className="strong">{personName(r._people)}</span>
                </td>
                <td>{r._positions?.Position || '—'}</td>
                <td>{fmtDate(r.Date)}</td>
                <td>{r.end_date ? fmtDate(r.end_date) : r.Relevance_of_the_record ? <span className="ok">працює</span> : '—'}</td>
                <td className="row-actions">
                  {r.Relevance_of_the_record && (
                    <button className="btn small danger" onClick={() => setClosing(r)}>
                      Завершити
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <AddStaff club={club} onClose={() => setAdding(false)} onDone={invalidate} />}
      {closing && (
        <CloseDialog
          title={`Завершити роботу: ${personName(closing._people)}`}
          hint="Запис лишається в історії з датою завершення"
          onClose={() => setClosing(null)}
          onConfirm={(d) => close.mutate({ id: closing.id, end_date: d })}
          error={close.error}
          busy={close.isPending}
        />
      )}
    </section>
  );
}

function AddStaff({ club, onClose, onDone }) {
  const dicts = useQuery({ queryKey: ['dicts'], queryFn: () => crm.get('/positions') });
  const [person, setPerson] = useState(null);
  const [creating, setCreating] = useState(false);
  const { values, set } = useForm({ positions_id: '', Date: today() });
  const add = useMutation({
    mutationFn: () =>
      crm.post('/staff/add', {
        people_id: person.id,
        teaminfo_id: club.id,
        positions_id: Number(values.positions_id),
        ...(club.leagues_id ? { leagues_id: club.leagues_id } : {}),
        Date: values.Date,
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const staffPositions = (dicts.data?.positions || []).filter((p) => !p.Player_position);
  return (
    <Modal title={`Додати в штаб ${club.TeamName}`} onClose={onClose} width={640}>
      {creating && <PersonForm person={{}} onClose={() => setCreating(false)} onCreated={(p) => setPerson(p)} />}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <PersonPicker value={person} onChange={setPerson} onCreate={() => setCreating(true)} />
        <div className="row2">
          <Field label="Посада">
            <select value={values.positions_id} onChange={set('positions_id')} required>
              <option value="">—</option>
              {staffPositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.Position}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата початку">
            <input type="date" value={values.Date} onChange={set('Date')} required />
          </Field>
        </div>
        <ErrorBox error={add.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={!person || !values.positions_id || add.isPending}>
            Додати
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Participations({ data }) {
  const qc = useQueryClient();
  const c = data.club;
  const setMain = useMutation({
    mutationFn: (leagues_id) => crm.patch(`/clubs/${c.id}`, { leagues_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['club', c.id] });
      qc.invalidateQueries({ queryKey: ['clubs'] });
    },
  });
  return (
    <section>
      <p className="muted">
        Головний турнір клубу — те, що ADMIN і фан-застосунок читають з поля «турнір» у клубі. Учасників у турнір додають на сторінці турніру.
      </p>
      <ErrorBox error={setMain.error} />
      {data.participations.length === 0 && <Empty>Клуб ще не заявлений у жоден турнір</Empty>}
      {data.participations.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Турнір</th>
              <th>Головний</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.participations.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/tournaments/${p.leagues_id}`} className="strong">
                    {p._leagues?.League || `Турнір #${p.leagues_id}`}
                  </Link>
                  {p.withdrawn && <span className="badge warn">знявся</span>}
                </td>
                <td>{c.leagues_id === p.leagues_id ? <span className="badge">головний</span> : ''}</td>
                <td className="row-actions">
                  {c.leagues_id !== p.leagues_id && (
                    <button className="btn small" onClick={() => setMain.mutate(p.leagues_id)} disabled={setMain.isPending}>
                      Зробити головним
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
