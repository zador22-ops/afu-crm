import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { club } from '../../api/client.js';
import { ErrorBox, Field } from '../../components/ui.jsx';
import PhotoCropper from '../../components/PhotoCropper.jsx';

// Фото людини за ТЗ — кадр 3:4, 600×800 (PhotoCropper, як емблема клубу)
const ФОТО_ЛЮДИНИ = { size: 600, height: 800 };

/**
 * Пошук людини в базі перед додаванням (склад 3.1, штаб 3.3): прізвище + повна
 * дата народження — так не з'явиться дубль. Сервер віддає мінімум: ім'я, рік,
 * клуби. onPick({people_id, active_clubs}) — наявна; onPick({new: true}) — нова.
 */
export function PersonSearch({ teaminfoId, пошук, setПошук, обрана, onPick }) {
  const [знайдено, setЗнайдено] = useState(null);
  const search = useMutation({
    mutationFn: () => club.get(`/clubs/${teaminfoId}/people-search`, { q: пошук.q.trim(), dob: пошук.dob }),
    onSuccess: (r) => {
      setЗнайдено(r.people || []);
      onPick(null);
    },
  });
  return (
    <>
      <p className="muted small-text">Спершу знайдіть людину в базі за прізвищем і датою народження — так не з'явиться дубль.</p>
      <div className="row2">
        <Field label="Прізвище">
          <input value={пошук.q} onChange={(e) => setПошук((s) => ({ ...s, q: e.target.value }))} autoFocus />
        </Field>
        <Field label="Дата народження">
          <input type="date" value={пошук.dob} onChange={(e) => setПошук((s) => ({ ...s, dob: e.target.value }))} />
        </Field>
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={() => search.mutate()} disabled={пошук.q.trim().length < 2 || !пошук.dob || search.isPending}>
          {search.isPending ? 'Шукаємо…' : 'Знайти в базі'}
        </button>
      </div>
      <ErrorBox error={search.error} />
      {знайдено && (
        <div className="pick-list">
          {знайдено.map((p) => (
            <label key={p.id} className="pick">
              <input type="radio" name="person" checked={обрана?.people_id === p.id} onChange={() => onPick({ people_id: p.id, active_clubs: p.active_clubs })} />
              <span>
                {[p.prizvushche, p.Name].filter(Boolean).join(' ')}
                {p.birth_year && <span className="muted small-text"> · {p.birth_year} р. н.</span>}
                {p.active_clubs?.length > 0 && <span className="muted small-text"> · зараз: {p.active_clubs.map((c) => c.name).join(', ')}</span>}
              </span>
            </label>
          ))}
          <label className="pick">
            <input type="radio" name="person" checked={!!обрана?.new} onChange={() => onPick({ new: true })} />
            <span>{знайдено.length ? 'Це інша людина — створити нову особу' : 'У базі немає — створити нову особу'}</span>
          </label>
        </div>
      )}
    </>
  );
}

/**
 * Дані людини (нова особа чи «Змінити»): ПІБ, дата народження, місто, зріст,
 * вага, фото з кадром 3:4. Фото одразу у vault клубу (сервер), у форму — його
 * об'єкт. value — {prizvushche, Name, po_batkovi, Date_of_birth, City, Growth,
 * Weight, Photo}; set(k, v). Без дати (withDob = false) — вона з пошуку.
 */
export function PersonFields({ teaminfoId, value, set, withDob = true, onBusy = () => {} }) {
  const [кадр, setКадр] = useState(null);
  const [вантажимо, setВантажимо] = useState(false);
  const [помилка, setПомилка] = useState(null);
  const поле = (k) => (e) => set(k, e.target.value);
  const завантажити = async (blob) => {
    setПомилка(null);
    setВантажимо(true);
    onBusy(true);
    try {
      const form = new FormData();
      form.append('image', blob, 'photo.jpg');
      const up = await club.upload(`/clubs/${teaminfoId}/upload`, form);
      set('Photo', up.image);
    } catch (err) {
      setПомилка(err);
    } finally {
      setВантажимо(false);
      onBusy(false);
    }
  };
  const зрістВага = (
    <>
      <Field label="Зріст, см">
        <input inputMode="numeric" value={value.Growth} onChange={поле('Growth')} />
      </Field>
      <Field label="Вага, кг">
        <input inputMode="numeric" value={value.Weight} onChange={поле('Weight')} />
      </Field>
    </>
  );
  return (
    <>
      <div className="row2">
        <Field label="Прізвище">
          <input value={value.prizvushche} onChange={поле('prizvushche')} required maxLength={100} />
        </Field>
        <Field label="Ім'я">
          <input value={value.Name} onChange={поле('Name')} required maxLength={100} />
        </Field>
      </div>
      <div className="row2">
        <Field label="По батькові">
          <input value={value.po_batkovi} onChange={поле('po_batkovi')} maxLength={100} />
        </Field>
        {withDob ? (
          <Field label="Дата народження">
            <input type="date" value={value.Date_of_birth} onChange={поле('Date_of_birth')} required />
          </Field>
        ) : (
          <Field label="Місто">
            <input value={value.City} onChange={поле('City')} maxLength={100} />
          </Field>
        )}
      </div>
      {withDob ? (
        <div className="row2">
          <Field label="Місто">
            <input value={value.City} onChange={поле('City')} maxLength={100} />
          </Field>
          <div className="row2">{зрістВага}</div>
        </div>
      ) : (
        <div className="row2">{зрістВага}</div>
      )}
      <Field label="Фото" hint="Портрет 3:4 — після вибору файлу оберіть кадр">
        <div className="club-cell">
          {value.Photo?.url && <img src={value.Photo.url} alt="" className="img-logo small" />}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setКадр(f);
            }}
          />
          {вантажимо && <span className="muted small-text">Завантажуємо…</span>}
        </div>
      </Field>
      <ErrorBox error={помилка} />
      {кадр && (
        <PhotoCropper
          file={кадр}
          {...ФОТО_ЛЮДИНИ}
          onClose={() => setКадр(null)}
          onDone={(blob) => {
            setКадр(null);
            завантажити(blob);
          }}
        />
      )}
    </>
  );
}
