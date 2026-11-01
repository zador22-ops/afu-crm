import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { club } from '../../api/client.js';
import { ErrorBox, Field, Modal, PageHeader } from '../../components/ui.jsx';
import PhotoCropper from '../../components/PhotoCropper.jsx';
import { ФОТО, стиснутиФото } from '../../utils/compressImage.js';
import { ПОЛЯ_КАРТКИ, ФОТО_КАРТКИ, значенняФорми, помилкиФорми, статусЧернетки, тілоЧернетки, якБуде } from '../../utils/clubDraft.js';

/**
 * «Мій клуб» (самообслуговування клубів, 1.3 + 2.1): картка свого клубу «як
 * буде після погодження» і її чернетка. Зміни не потрапляють на сайт і в
 * застосунок, доки АФУ їх не погодить: сервер пише лише заявку
 * (change_request), а не TeamInfo. Надіслати на погодження — етап 2.2.
 */
export default function MyClubPage({ teaminfoId }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const card = useQuery({ queryKey: ['club-card', teaminfoId], queryFn: () => club.get(`/clubs/${teaminfoId}`) });
  const draft = useQuery({ queryKey: ['club-draft', teaminfoId], queryFn: () => club.get(`/clubs/${teaminfoId}/draft`) });
  const venues = useQuery({ queryKey: ['club-venues'], queryFn: () => club.get('/venues'), staleTime: 300_000 });

  const чернетка = draft.data?.draft || null;
  const статус = статусЧернетки(чернетка);
  const { картка: c, змінені } = якБуде(card.data, чернетка);
  const наПогодженні = чернетка?.status === 'submitted';
  const оновити = () => {
    qc.invalidateQueries({ queryKey: ['club-draft', teaminfoId] });
    qc.invalidateQueries({ queryKey: ['club-pending', teaminfoId] });
  };

  const save = useMutation({
    mutationFn: (body) => club.put(`/clubs/${teaminfoId}/draft`, body),
    onSuccess: () => {
      оновити();
      setEditing(false);
    },
  });
  const discard = useMutation({ mutationFn: () => club.del(`/clubs/${teaminfoId}/draft`), onSuccess: оновити });

  const назваАрени = (id) => (venues.data || []).find((v) => v.id === Number(id))?.City;
  const фото = (img) => img?.url || null;
  const позначка = (k) => (змінені.has(k) ? <span className="draft-mark">змінено</span> : null);

  return (
    <>
      <PageHeader
        title={card.data?.TeamName || 'Мій клуб'}
        subtitle="Картка клубу на сайті й у застосунку. Зміни стають видимими після погодження АФУ"
        actions={
          <button className="btn primary" onClick={() => setEditing(true)} disabled={!card.data || наПогодженні}>
            Змінити картку
          </button>
        }
      />
      <ErrorBox error={card.error || draft.error || discard.error} />
      {статус && (
        <div className={`draft-status ${статус.тон}`}>
          <span>{статус.текст}</span>
          {чернетка?.status === 'draft' && (
            <button className="btn small" onClick={() => discard.mutate()} disabled={discard.isPending}>
              Скасувати чернетку
            </button>
          )}
        </div>
      )}
      {card.isPending && <div className="center muted">Завантаження…</div>}
      {card.data && (
        <section className="card-form my-club">
          <div className="my-club-head">
            <figure>
              {фото(c.TeamLogo) ? <img src={фото(c.TeamLogo)} alt="Емблема" className="my-club-logo" /> : <div className="logo-empty my-club-logo" />}
              <figcaption className="muted small-text">Емблема {позначка('TeamLogo')}</figcaption>
            </figure>
            {фото(c.TeamPhoto) && (
              <figure>
                <img src={фото(c.TeamPhoto)} alt="Фото команди" className="my-club-photo" />
                <figcaption className="muted small-text">Фото команди {позначка('TeamPhoto')}</figcaption>
              </figure>
            )}
          </div>
          <dl className="my-club-fields">
            {ПОЛЯ_КАРТКИ.filter((п) => п.kind !== 'color' && п.kind !== 'venue').map(({ key, label, kind }) => (
              <div key={key}>
                <dt>
                  {label} {kind === 'contact' && <span className="muted">· службове</span>} {позначка(key)}
                </dt>
                <dd>{c[key] ? String(c[key]) : <span className="muted">не заповнено</span>}</dd>
              </div>
            ))}
            <div>
              <dt>Кольори форми {позначка('kit_color_primary') || позначка('kit_color_secondary')}</dt>
              <dd>
                {c.kit_color_primary || c.kit_color_secondary ? (
                  [c.kit_color_primary, c.kit_color_secondary].filter(Boolean).map((колір) => (
                    <span key={колір} className="kit-swatch" style={{ background: колір }} title={колір} />
                  ))
                ) : (
                  <span className="muted">не заповнено</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Домашня арена {позначка('home_venues_id') || позначка('venue_suggestion')}</dt>
              <dd>
                {c.home_venues_id ? назваАрени(c.home_venues_id) || `арена №${c.home_venues_id}` : <span className="muted">не заповнено</span>}
                {c.venue_suggestion && <div className="muted small-text">Запропоновано: {c.venue_suggestion}</div>}
              </dd>
            </div>
          </dl>
        </section>
      )}
      {editing && card.data && (
        <CardForm teaminfoId={teaminfoId} initial={значенняФорми(card.data, чернетка)} venues={venues.data || []} onClose={() => setEditing(false)} onSave={save} />
      )}
    </>
  );
}

function CardForm({ teaminfoId, initial, venues, onClose, onSave }) {
  const [в, setВ] = useState(initial);
  const [кадр, setКадр] = useState(null); // файл емблеми на обрізку
  const [вантажимо, setВантажимо] = useState(null);
  const [помилкаФайлу, setПомилкаФайлу] = useState(null);
  const set = (k) => (e) => setВ((s) => ({ ...s, [k]: e.target.value }));
  const помилки = помилкиФорми(в);

  // Файл одразу у vault (сервер), у форму — його об'єкт; у картку клубу він
  // потрапить лише після погодження
  const завантажити = async (k, blob, ім) => {
    setПомилкаФайлу(null);
    setВантажимо(k);
    try {
      const form = new FormData();
      form.append('image', blob, ім);
      const r = await club.upload(`/clubs/${teaminfoId}/upload`, form);
      setВ((s) => ({ ...s, [k]: r.image }));
    } catch (err) {
      setПомилкаФайлу(err);
    } finally {
      setВантажимо(null);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (помилки.length) return;
    onSave.mutate(тілоЧернетки(в));
  };

  return (
    <Modal title="Зміни картки клубу" onClose={onClose} width={640}>
      <form className="form" onSubmit={submit}>
        <p className="muted small-text">
          Зберігається як чернетка. На сайті й у застосунку з'явиться лише після погодження АФУ. Назву клубу, турнір і
          материнський клуб змінює АФУ.
        </p>
        <div className="row2">
          {ФОТО_КАРТКИ.map(({ key, label }) => (
            <Field key={key} label={label} hint={key === 'TeamLogo' ? 'Квадрат 1024×1024; прозоре тло — краще' : 'Горизонтальне фото команди, до 5 МБ'}>
              <div className="club-cell">
                {в[key]?.url && <img src={в[key].url} alt="" className="img-logo small" />}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    if (key === 'TeamLogo') setКадр(f);
                    else {
                      const r = await стиснутиФото(f, ФОТО);
                      завантажити(key, r.file || f, f.name);
                    }
                  }}
                />
              </div>
              {вантажимо === key && <span className="muted small-text">Завантажуємо…</span>}
            </Field>
          ))}
        </div>
        <ErrorBox error={помилкаФайлу} />
        <Field label="Місто" hint="Як показується під назвою клубу на сайті й у застосунку, напр. «Київ»">
          <input value={в.TeamInfo} onChange={set('TeamInfo')} maxLength={60} />
        </Field>
        <div className="row2">
          <Field label="Рік заснування">
            <input inputMode="numeric" value={в.founded_year} onChange={set('founded_year')} placeholder="напр. 2008" />
          </Field>
          <Field label="Домашня арена" hint="Немає в списку — запропонуйте нижче, АФУ додасть">
            <select value={в.home_venues_id} onChange={set('home_venues_id')}>
              <option value="">—</option>
              {venues.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.City}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Запропонувати арену" hint="Місто й об'єкт, напр. «м. Суми, СК «Юність»»">
          <input value={в.venue_suggestion} onChange={set('venue_suggestion')} maxLength={200} />
        </Field>
        <div className="row2">
          {['website', 'instagram', 'facebook', 'youtube'].map((k) => (
            <Field key={k} label={ПОЛЯ_КАРТКИ.find((п) => п.key === k).label}>
              <input type="url" inputMode="url" value={в[k]} onChange={set(k)} placeholder="https://" />
            </Field>
          ))}
        </div>
        <div className="row2">
          {['kit_color_primary', 'kit_color_secondary'].map((k) => (
            <Field key={k} label={ПОЛЯ_КАРТКИ.find((п) => п.key === k).label}>
              <div className="club-cell">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(в[k]) ? в[k] : '#ffffff'} onChange={set(k)} aria-label="Вибрати колір" />
                <input value={в[k]} onChange={set(k)} placeholder="#1A2B3C" maxLength={7} />
              </div>
            </Field>
          ))}
        </div>
        <p className="muted small-text">Контакти — службові для АФУ, на сайт не йдуть.</p>
        <div className="row2">
          <Field label="Контактна особа">
            <input value={в.contact_name} onChange={set('contact_name')} maxLength={200} />
          </Field>
          <Field label="Телефон">
            <input type="tel" value={в.contact_phone} onChange={set('contact_phone')} maxLength={200} />
          </Field>
        </div>
        <Field label="Пошта">
          <input type="email" value={в.contact_email} onChange={set('contact_email')} maxLength={200} />
        </Field>
        {помилки.length > 0 && (
          <div className="error-box">
            {помилки.map((п) => (
              <div key={п}>{п}</div>
            ))}
          </div>
        )}
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending || !!вантажимо || помилки.length > 0}>
            {onSave.isPending ? 'Зберігаємо…' : 'Зберегти чернетку'}
          </button>
        </div>
      </form>
      {кадр && (
        <PhotoCropper
          file={кадр}
          size={1024}
          прозоро
          onClose={() => setКадр(null)}
          onDone={(blob) => {
            setКадр(null);
            завантажити('TeamLogo', blob, 'logo.png');
          }}
        />
      )}
    </Modal>
  );
}
