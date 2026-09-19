import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, useForm } from '../components/ui.jsx';

const ЕТАПИ = { 1: 'Основна таблиця', 2: 'Плей-оф / сітка' };

const ТИПИ = {
  playoff: 'Плей-оф',
  relegation: 'Пониження',
  promotion: 'Підвищення',
  europe: 'Єврокубки',
};

/**
 * Смуги турнірної таблиці (плей-оф, пониження, підвищення, єврокубки) —
 * завдання Андрія 2026-09-19, таблиця `league_zone` (t69) від Backend.
 *
 * КОЛЬОРІВ ТУТ НЕМАЄ НАВМИСНО — за словом Backend. Колір смуги це рішення
 * дизайну, не факт про турнір: застосунок сам зіставляє `zone_type` зі своїм
 * токеном теми. Тут лише тип, межа місць і підпис для легенди.
 *
 * Ключ — пара (турнір, етап), не сам етап: `League stage` глобальна, два
 * рядки на всю базу без прив'язки до змагання. Зона без `leagues_id` дала б
 * Кубку межі Екстра-ліги.
 *
 * Три правила тримає ендпоінт (не лише форма): place_from ≤ place_to, обидва
 * ≥ 1, і зони в межах однієї пари (турнір, етап) не перетинаються. Помилка
 * тут тиха й виглядає як офіційна інформація АФУ, тому валідація на сервері,
 * а не тільки в JSX.
 */
export default function TournamentZones({ tid }) {
  const qc = useQueryClient();
  const zones = useQuery({ queryKey: ['zones', tid], queryFn: () => crm.get(`/tournaments/${tid}/zones`) });
  const [adding, setAdding] = useState(null); // null | { league_stage_id }
  const [editing, setEditing] = useState(null); // зона, яку редагують

  const invalidate = () => qc.invalidateQueries({ queryKey: ['zones', tid] });
  const add = useMutation({
    mutationFn: (body) => crm.post(`/tournaments/${tid}/zones`, body),
    onSuccess: () => {
      invalidate();
      setAdding(null);
    },
  });
  const save = useMutation({
    mutationFn: ({ id, data }) => crm.patch(`/zones/${id}`, data),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id) => crm.del(`/zones/${id}`),
    onSuccess: invalidate,
  });

  const byStage = { 1: [], 2: [] };
  for (const z of zones.data || []) (byStage[z.league_stage_id] ??= []).push(z);

  return (
    <section>
      <p className="muted">
        Смуги показуються в турнірній таблиці фанатського застосунку. Місця можуть виходити за поточну кількість команд —
        це не помилка, склад сезону змінюється.
      </p>
      <ErrorBox error={zones.error || remove.error} />
      {Object.entries(ЕТАПИ).map(([stage, stageLabel]) => (
        <div key={stage} className="stage-block">
          <div className="section-bar">
            <h3>{stageLabel}</h3>
            <button className="btn small primary" onClick={() => setAdding({ league_stage_id: Number(stage) })}>
              Додати зону
            </button>
          </div>
          {byStage[stage]?.length ? (
            <table className="table compact">
              <thead>
                <tr>
                  <th>Місця</th>
                  <th>Тип</th>
                  <th>Підпис</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {byStage[stage].map((z) => (
                  <tr key={z.id}>
                    <td className="num">
                      {z.place_from}–{z.place_to}
                    </td>
                    <td>{ТИПИ[z.zone_type] || z.zone_type}</td>
                    <td className="muted">{z.label || '—'}</td>
                    <td className="row-actions">
                      <button className="btn small" onClick={() => setEditing(z)}>
                        Редагувати
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => window.confirm(`Прибрати зону «${z.label || ТИПИ[z.zone_type]}» (${z.place_from}–${z.place_to})?`) && remove.mutate(z.id)}
                      >
                        Прибрати
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Зон на цьому етапі ще немає</Empty>
          )}
        </div>
      ))}
      {adding && <ZoneForm league_stage_id={adding.league_stage_id} onClose={() => setAdding(null)} onSave={add} />}
      {editing && (
        <ZoneForm
          zone={editing}
          league_stage_id={editing.league_stage_id}
          onClose={() => setEditing(null)}
          onSave={{
            mutate: (data) => save.mutate({ id: editing.id, data }),
            isPending: save.isPending,
            error: save.error,
          }}
        />
      )}
    </section>
  );
}

function ZoneForm({ zone, league_stage_id, onClose, onSave }) {
  const { values, set } = useForm({
    zone_type: zone?.zone_type || 'playoff',
    place_from: zone?.place_from ?? '',
    place_to: zone?.place_to ?? '',
    // Порожній підпис виглядає в застосунку як зламана верстка, тому поле
    // обовʼязкове (Backend, 2026-09-19) — і для нової зони одразу підставляємо
    // назву типу, щоб не залишити порожнім там, де нема чого вигадувати.
    label: zone?.label || ТИПИ[zone?.zone_type || 'playoff'],
  });
  const submit = (e) => {
    e.preventDefault();
    const data = {
      zone_type: values.zone_type,
      place_from: Number(values.place_from),
      place_to: Number(values.place_to),
      label: values.label.trim(),
    };
    onSave.mutate(zone ? data : { ...data, league_stage_id });
  };
  return (
    <Modal title={zone ? 'Редагувати зону' : 'Нова зона'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Тип">
          <select value={values.zone_type} onChange={set('zone_type')}>
            {Object.entries(ТИПИ).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <div className="row2">
          <Field label="Перше місце">
            <input type="number" min="1" value={values.place_from} onChange={set('place_from')} required autoFocus />
          </Field>
          <Field label="Останнє місце" hint="Включно">
            <input type="number" min="1" value={values.place_to} onChange={set('place_to')} required />
          </Field>
        </div>
        <Field label="Підпис для легенди" hint="Як показується під таблицею в застосунку">
          <input value={values.label} onChange={set('label')} required />
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
