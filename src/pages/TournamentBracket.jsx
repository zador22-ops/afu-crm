import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, useForm } from '../components/ui.jsx';

/**
 * Сітка плей-оф: пари команд у межах раунду (раунд — це тур в етапі «сітка»).
 *
 * ЧОГО ТУТ НЕМАЄ І ЧОМУ. Переможець пари ніде не зберігається: у таблиці
 * `Bracket` є лише дві команди й тур. Тому сітка не «веде» команду далі — хто
 * пройшов, видно з результату матчу, і поставити наступну пару має людина.
 * Автоматичне просування зробимо, коли Андрій опише формат Кубка: без нього
 * невідомо ні як рахуються серії з двох матчів, ні що робити з нічиєю.
 *
 * Поруч із парою показуємо матч між тими самими командами в тому ж раунді —
 * це єдиний спосіб побачити, чим пара скінчилась.
 */
export default function TournamentBracket({ tid, participants }) {
  const qc = useQueryClient();
  const bracket = useQuery({ queryKey: ['bracket', tid], queryFn: () => crm.get(`/tournaments/${tid}/bracket`) });
  const [adding, setAdding] = useState(null);

  const add = useMutation({
    mutationFn: (body) => crm.post(`/tournaments/${tid}/bracket`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bracket', tid] });
      setAdding(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id) => crm.del(`/bracket/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bracket', tid] }),
  });

  const раунди = useMemo(
    () => (bracket.data?.tours || []).filter((t) => t._stage?.stage_type === 'сітка'),
    [bracket.data]
  );
  const команди = useMemo(
    () =>
      (participants || [])
        .map((p) => ({ id: p.teaminfo_id, name: p._club?.TeamName || `Клуб ${p.teaminfo_id}` }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [participants]
  );

  const матчПари = (пара) =>
    (bracket.data?.matches || []).find(
      (m) =>
        m.tours_id === пара.tours_id &&
        ((m.team1_id === пара.teaminfo_id1 && m.team2_id === пара.teaminfo_id2) ||
          (m.team1_id === пара.teaminfo_id2 && m.team2_id === пара.teaminfo_id1))
    );

  if (bracket.isPending) return <div className="muted">Завантаження…</div>;

  return (
    <section>
      <div className="section-bar">
        <span className="muted">
          Раунд — це тур в етапі «сітка». Переможець у базі не зберігається, тож наступну пару ставить людина
        </span>
        <button className="btn primary" onClick={() => setAdding({})} disabled={!раунди.length || команди.length < 2}>
          Нова пара
        </button>
      </div>
      <ErrorBox error={bracket.error || remove.error} />
      {!раунди.length && <Empty>У турнірі немає раундів етапу «сітка» — створіть їх у вкладці «Тури»</Empty>}
      {раунди.map((р) => {
        const пари = (bracket.data?.pairs || []).filter((p) => p.tours_id === р.id);
        return (
          <div key={р.id} className="stage-block">
            <h3>
              {р.TourName}
              <span className="muted small-text"> · пар: {пари.length}</span>
            </h3>
            {пари.length === 0 && <Empty>Пар ще немає</Empty>}
            {пари.length > 0 && (
              <table className="table compact">
                <tbody>
                  {пари.map((п) => {
                    const м = матчПари(п);
                    return (
                      <tr key={п.id}>
                        <td className="strong">{п._team1?.TeamName || '—'}</td>
                        <td className="muted">—</td>
                        <td className="strong">{п._team2?.TeamName || '—'}</td>
                        <td className="muted">
                          {м
                            ? Number(м.match_status_id) > 2
                              ? `${м.Result_team1 ?? 0} : ${м.Result_team2 ?? 0}${
                                  м.team1_id === п.teaminfo_id1 ? '' : ' (у зворотному порядку)'
                                }`
                              : 'матч призначено, не зіграний'
                            : 'матчу ще немає'}
                        </td>
                        <td className="row-actions">
                          <button className="btn small danger ghost" onClick={() => remove.mutate(п.id)} disabled={remove.isPending}>
                            Прибрати
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {adding && <PairForm раунди={раунди} команди={команди} onClose={() => setAdding(null)} onSave={add} />}
    </section>
  );
}

function PairForm({ раунди, команди, onClose, onSave }) {
  const { values, set } = useForm({ tours_id: раунди[0]?.id || '', teaminfo_id1: '', teaminfo_id2: '' });
  return (
    <Modal title="Пара сітки" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave.mutate({
            tours_id: Number(values.tours_id),
            teaminfo_id1: Number(values.teaminfo_id1),
            teaminfo_id2: Number(values.teaminfo_id2),
          });
        }}
      >
        <Field label="Раунд">
          <select value={values.tours_id} onChange={set('tours_id')} required>
            {раунди.map((р) => (
              <option key={р.id} value={р.id}>
                {р.TourName}
              </option>
            ))}
          </select>
        </Field>
        <div className="row2">
          <Field label="Команда 1">
            <select value={values.teaminfo_id1} onChange={set('teaminfo_id1')} required>
              <option value="">—</option>
              {команди.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Команда 2">
            <select value={values.teaminfo_id2} onChange={set('teaminfo_id2')} required>
              <option value="">—</option>
              {команди.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={onSave.isPending}>
            Додати
          </button>
        </div>
      </form>
    </Modal>
  );
}
