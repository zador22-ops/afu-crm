import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm, request } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, useForm } from '../components/ui.jsx';
import PlayoffBracket from '../components/PlayoffBracket.jsx';
import { розкластиСітку } from '../utils/bracketLayout.js';
import { рахунокМатчу, стадіїСітки } from '../utils/bracketView.js';

/**
 * Сітка плей-оф деревом — так само, як її бачить уболівальник у застосунку (бриф crm-bracket-editor,
 * Андрій 14.11): раунди колонками, дужки до наступного раунду, горизонтальна прокрутка. Дані дерева —
 * той самий публічний Default `bracket/byStage/allInfo`, що читає застосунок, і та сама розкладка
 * (src/utils/bracketLayout.js — дослівна копія з AFU). Раунд — це тур в етапі «сітка».
 *
 * ЧОГО ТУТ НЕМАЄ І ЧОМУ. Переможець далі сіткою не «йде» сам: формат Кубка (серія з двох матчів, нічия)
 * Андрій ще не описав. Хто пройшов, видно з рахунку, а наступну пару ставить людина.
 *
 * Натиснути пару — подробиці (матчі пари, «Прибрати»); натиснути порожній слот — нова пара в цьому раунді.
 */
export default function TournamentBracket({ tid, participants }) {
  const qc = useQueryClient();
  const bracket = useQuery({ queryKey: ['bracket', tid], queryFn: () => crm.get(`/tournaments/${tid}/bracket`) });
  const [adding, setAdding] = useState(null);
  const [opened, setOpened] = useState(null);

  const стадії = useMemo(() => стадіїСітки(bracket.data?.tours), [bracket.data]);
  const вигляд = useQueries({
    queries: стадії.map((с) => ({
      queryKey: ['bracket-view', tid, с.id],
      queryFn: () => request('base', '/bracket/byStage/allInfo', { query: { league_id: tid, league_stage_id: с.id }, auth: false }),
    })),
  });

  const оновити = () => {
    qc.invalidateQueries({ queryKey: ['bracket', tid] });
    qc.invalidateQueries({ queryKey: ['bracket-view', tid] });
  };
  const add = useMutation({
    mutationFn: (body) => crm.post(`/tournaments/${tid}/bracket`, body),
    onSuccess: () => {
      оновити();
      setAdding(null);
    },
  });
  const edit = useMutation({
    mutationFn: ({ id, body }) => crm.patch(`/bracket/${id}`, body),
    onSuccess: () => {
      оновити();
      setOpened(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id) => crm.del(`/bracket/${id}`),
    onSuccess: () => {
      оновити();
      setOpened(null);
    },
  });

  const раунди = useMemo(() => стадії.flatMap((с) => с.раунди), [стадії]);
  const команди = useMemo(
    () =>
      (participants || [])
        .map((p) => ({ id: p.teaminfo_id, name: p._club?.TeamName || `Клуб ${p.teaminfo_id}` }))
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    [participants]
  );

  if (bracket.isPending) return <div className="muted">Завантаження…</div>;

  return (
    <section>
      <div className="section-bar">
        <span className="muted">Так сітку бачить уболівальник у застосунку. Натисніть пару — подробиці, порожню клітинку — нова пара</span>
        <button className="btn primary" onClick={() => setAdding({})} disabled={!раунди.length || команди.length < 2}>
          Нова пара
        </button>
      </div>
      <ErrorBox error={bracket.error || remove.error} />
      {!раунди.length && <Empty>У турнірі немає раундів етапу «сітка» — створіть їх у вкладці «Тури»</Empty>}
      {стадії.map((с, і) => {
        const q = вигляд[і];
        const розкладка = q?.data ? розкластиСітку({ tours: q.data.tours, bracket: q.data.bracket }) : null;
        return (
          <div key={с.id} className="stage-block">
            {стадії.length > 1 && <h3>{с.назва}</h3>}
            <ErrorBox error={q?.error} />
            {q?.isPending && <div className="muted">Завантаження сітки…</div>}
            {розкладка && (
              <PlayoffBracket
                розкладка={розкладка}
                onPair={(пара, раунд) => setOpened({ пара, раунд })}
                onEmpty={команди.length >= 2 ? (раундId) => setAdding({ tours_id: раундId }) : undefined}
              />
            )}
          </div>
        );
      })}
      {opened && <PairCard {...opened} команди={команди} onClose={() => setOpened(null)} onRemove={remove} onEdit={edit} />}
      {adding && <PairForm раунди={раунди} команди={команди} початковий={adding.tours_id} onClose={() => setAdding(null)} onSave={add} />}
    </section>
  );
}

/** Картка пари: обидві команди (заміна на місці), матчі пари з рахунком чи станом, «Прибрати». */
function PairCard({ пара, раунд, команди, onClose, onRemove, onEdit }) {
  const н1 = пара._teaminfo1?.TeamName || 'Команда';
  const н2 = пара._teaminfo2?.TeamName || 'Команда';
  const матчі = Array.isArray(пара.legs) ? пара.legs : [];
  const { values, set } = useForm({ teaminfo_id1: String(пара.teaminfo_id1 || ''), teaminfo_id2: String(пара.teaminfo_id2 || '') });
  const змінено = values.teaminfo_id1 !== String(пара.teaminfo_id1 || '') || values.teaminfo_id2 !== String(пара.teaminfo_id2 || '');
  const однакові = values.teaminfo_id1 && values.teaminfo_id1 === values.teaminfo_id2;
  // Команду, якої вже немає серед учасників, теж показуємо — щоб вибір не стрибнув на «—»
  const варіанти = (id, назва) => (id && !команди.some((c) => String(c.id) === String(id)) ? [{ id, name: `${назва} (не учасник)` }, ...команди] : команди);
  return (
    <Modal title={`${раунд.назва}: ${н1} — ${н2}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onEdit.mutate({ id: пара.id, body: { teaminfo_id1: Number(values.teaminfo_id1), teaminfo_id2: Number(values.teaminfo_id2) } });
        }}
      >
        <div className="row2">
          <Field label="Команда 1">
            <select value={values.teaminfo_id1} onChange={set('teaminfo_id1')} required>
              {варіанти(пара.teaminfo_id1, н1).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Команда 2">
            <select value={values.teaminfo_id2} onChange={set('teaminfo_id2')} required>
              {варіанти(пара.teaminfo_id2, н2).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {однакові && <div className="error-box">Команда не може грати сама з собою</div>}
        {змінено && матчі.length > 0 && (
          <div className="warn-box">Матчі пари лишаться між старими командами — у сітці пара покаже матчі нових команд, якщо вони є в цьому раунді.</div>
        )}
        <ErrorBox error={onEdit.error} />
        {змінено && (
          <div className="form-actions">
            <span className="spacer" />
            <button className="btn primary" disabled={onEdit.isPending || однакові}>
              {onEdit.isPending ? 'Зберігаємо…' : 'Зберегти команди'}
            </button>
          </div>
        )}
      </form>
      <div className="form">
        {матчі.length === 0 && <div className="muted">Матчу між цими командами в раунді ще немає — створіть його у вкладці «Матчі»</div>}
        {матчі.length > 0 && (
          <table className="table compact">
            <tbody>
              {матчі.map((м, і) => (
                <tr key={м.match_id ?? і}>
                  <td className="muted">{матчі.length > 1 ? `Матч ${і + 1}` : 'Матч'}</td>
                  <td className="strong">{рахунокМатчу(м) ? `${н1} ${рахунокМатчу(м)} ${н2}` : 'не зіграний'}</td>
                  <td>
                    {м.match_id && (
                      <a href={`/matches/${м.match_id}`} target="_blank" rel="noreferrer">
                        Відкрити
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ErrorBox error={onRemove.error} />
        <div className="form-actions">
          <button
            type="button"
            className="btn danger ghost"
            disabled={onRemove.isPending}
            onClick={() => {
              if (window.confirm(`Прибрати пару «${н1} — ${н2}» із сітки? Матчі пари лишаться.`)) onRemove.mutate(пара.id);
            }}
          >
            Прибрати пару
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Закрити
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PairForm({ раунди, команди, початковий, onClose, onSave }) {
  const { values, set } = useForm({ tours_id: початковий || раунди[0]?.id || '', teaminfo_id1: '', teaminfo_id2: '' });
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
