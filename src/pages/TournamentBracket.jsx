import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm, request } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, useForm } from '../components/ui.jsx';
import PlayoffBracket from '../components/PlayoffBracket.jsx';
import { розкластиСітку } from '../utils/bracketLayout.js';
import { БЕЗ_СУПЕРНИКА, єСуперник, назваКоманди, обидвіПорожні, місцеНаКрок, місцеЦілі, позиціяДляСлоту, порядокВирішує, рахунокМатчу, стадіїСітки, тілоЗмінПари, тілоНовоїПари } from '../utils/bracketView.js';

/**
 * Сітка плей-оф деревом — так само, як її бачить уболівальник у застосунку (бриф crm-bracket-editor,
 * Андрій 14.11): раунди колонками, дужки до наступного раунду, горизонтальна прокрутка. Дані дерева —
 * той самий публічний Default `bracket/byStage/allInfo`, що читає застосунок, і та сама розкладка
 * (src/utils/bracketLayout.js — дослівна копія з AFU). Раунд — це тур в етапі «сітка».
 *
 * ЧОГО ТУТ НЕМАЄ І ЧОМУ. Переможець далі сіткою не «йде» сам: формат Кубка (серія з двох матчів, нічия)
 * Андрій ще не описав. Хто пройшов, видно з рахунку, а наступну пару ставить людина.
 *
 * Натиснути пару — подробиці (команди, матчі пари, «Вище / Нижче», «Прибрати»); натиснути порожній слот —
 * нова пара в цьому раунді; перетягнути пару на іншу пару раунду — поміняти місце (Bracket.position, move).
 */
export default function TournamentBracket({ tid, participants }) {
  const qc = useQueryClient();
  const bracket = useQuery({ queryKey: ['bracket', tid], queryFn: () => crm.get(`/tournaments/${tid}/bracket`) });
  const [adding, setAdding] = useState(null);
  const [opened, setOpened] = useState(null);
  const [примітка, setПримітка] = useState('');

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
  // Нова пара сервер ставить останньою в раунді. Якщо її створено з порожньої клітинки — одразу
  // переставляємо (move) так, щоб розкладка поставила її саме в ту клітинку (бриф bracket-slot-position).
  // Кнопка «Нова пара» без клітинки — як і було, останньою.
  const add = useMutation({
    mutationFn: async ({ body, ціль }) => {
      const пара = await crm.post(`/tournaments/${tid}/bracket`, body);
      if (ціль?.слот != null && ціль.tours_id === body.tours_id && пара?.id) {
        const дані = await request('base', '/bracket/byStage/allInfo', { query: { league_id: tid, league_stage_id: ціль.стадія }, auth: false });
        const тур = (дані?.bracket || []).filter((п) => п?.tours_id === body.tours_id);
        const тепер = тур.findIndex((п) => п.id === пара.id) + 1;
        const position = позиціяДляСлоту(дані, розкластиСітку, пара.id, body.tours_id, ціль.слот);
        if (position && position !== тепер) await crm.patch(`/tournaments/${tid}/bracket/${пара.id}/move`, { position });
        if (!position)
          return {
            пара,
            примітка:
              'Пару додано, але не в ту клітинку: місця в цьому раунді задають пари наступного раунду (за командами), а вільні пари стають у вільні клітинки зверху підряд. Перетягніть пару або змініть порядок кнопками «Вище / Нижче».',
          };
      }
      return { пара, примітка: '' };
    },
    onSuccess: (r) => {
      оновити();
      setAdding(null);
      setПримітка(r?.примітка || '');
    },
  });
  const edit = useMutation({
    mutationFn: ({ id, body }) => crm.patch(`/bracket/${id}`, body),
    onSuccess: () => {
      оновити();
      setOpened(null);
    },
  });
  // Місце пари в раунді (контракт Backend bracket-position): один виклик, решта зсувається
  const move = useMutation({
    mutationFn: ({ id, position }) => crm.patch(`/tournaments/${tid}/bracket/${id}/move`, { position }),
    onSuccess: оновити,
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
        <button className="btn primary" onClick={() => setAdding({})} disabled={!раунди.length || команди.length < 1}>
          Нова пара
        </button>
      </div>
      <ErrorBox error={bracket.error || remove.error || move.error} />
      {примітка && (
        <div className="warn-box">
          {примітка}{' '}
          <button type="button" className="btn small" onClick={() => setПримітка('')}>
            Зрозуміло
          </button>
        </div>
      )}
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
                onPair={(пара, раунд) => {
                  // «Вище / Нижче» — лише де порядок справді вирішує місце (наступний раунд ще не зведено)
                  const к = розкладка.колонки.findIndex((x) => x.id === раунд.id);
                  const пари = q.data.bracket;
                  const можна = к !== -1 && порядокВирішує(розкладка.колонки, к);
                  // «За 3 місце» (к = -1) — одна пара, переставляти нічого
                  setOpened({ пара, раунд, крок: к === -1 ? undefined : можна ? (д) => місцеНаКрок(пари, пара, д) : null });
                }}
                onEmpty={команди.length >= 1 ? (раундId, слот) => setAdding({ tours_id: раундId, слот, стадія: с.id }) : undefined}
                onMove={(пара, ціль) => {
                  const position = місцеЦілі(q.data.bracket, ціль);
                  if (position) move.mutate({ id: пара.id, position });
                }}
              />
            )}
          </div>
        );
      })}
      {opened && (
        <PairCard
          {...opened}
          команди={команди}
          onClose={() => setOpened(null)}
          onRemove={remove}
          onEdit={edit}
          onMove={(position) => move.mutate({ id: opened.пара.id, position }, { onSuccess: () => setOpened(null) })}
          moving={move}
        />
      )}
      {adding && (
        <PairForm
          раунди={раунди}
          команди={команди}
          початковий={adding.tours_id}
          onClose={() => setAdding(null)}
          onSave={{ ...add, mutate: (body) => add.mutate({ body, ціль: adding }) }}
        />
      )}
    </section>
  );
}

// Заміна команд пари на місці — PATCH crm/bracket/{id} (#828, розгорнуто 16.11 за «так» Андрія).
// Вмикалась і вимикалась 14.11, доки ендпоінта не було на живому.
const ЗАМІНА_КОМАНД = true;

/** Картка пари: обидві команди (заміна на місці), матчі пари з рахунком чи станом, «Прибрати». */
function PairCard({ пара, раунд, команди, крок, onClose, onRemove, onEdit, onMove, moving }) {
  const н1 = назваКоманди(пара, 1);
  const н2 = назваКоманди(пара, 2);
  const матчі = Array.isArray(пара.legs) ? пара.legs : [];
  const { values, set } = useForm({ teaminfo_id1: String(пара.teaminfo_id1 || ''), teaminfo_id2: String(пара.teaminfo_id2 || '') });
  const змінено = values.teaminfo_id1 !== String(пара.teaminfo_id1 || '') || values.teaminfo_id2 !== String(пара.teaminfo_id2 || '');
  const однакові = values.teaminfo_id1 && values.teaminfo_id1 === values.teaminfo_id2;
  const порожня = обидвіПорожні(values);
  // Команду, якої вже немає серед учасників, теж показуємо — щоб вибір не стрибнув на «—»
  const варіанти = (id, назва) => (id && !команди.some((c) => String(c.id) === String(id)) ? [{ id, name: `${назва} (не учасник)` }, ...команди] : команди);
  return (
    <Modal title={`${раунд.назва}: ${н1} — ${н2}`} onClose={onClose}>
      {ЗАМІНА_КОМАНД && (
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onEdit.mutate({ id: пара.id, body: тілоЗмінПари(пара, values) });
        }}
      >
        <div className="row2">
          <Field label="Команда 1">
            <select value={values.teaminfo_id1} onChange={set('teaminfo_id1')}>
              <option value="">— {БЕЗ_СУПЕРНИКА}</option>
              {варіанти(пара.teaminfo_id1, н1).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Команда 2" hint="Порожньо — команда проходить без суперника (бай)">
            <select value={values.teaminfo_id2} onChange={set('teaminfo_id2')}>
              <option value="">— {БЕЗ_СУПЕРНИКА}</option>
              {варіанти(пара.teaminfo_id2, н2).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {однакові && <div className="error-box">Команда не може грати сама з собою</div>}
        {порожня && <div className="error-box">Оберіть хоча б одну команду — порожньою може бути лише одна сторона (бай)</div>}
        {змінено && матчі.length > 0 && (
          <div className="warn-box">Матчі пари лишаться між старими командами — у сітці пара покаже матчі нових команд, якщо вони є в цьому раунді.</div>
        )}
        <ErrorBox error={onEdit.error} />
        {змінено && (
          <div className="form-actions">
            <span className="spacer" />
            <button className="btn primary" disabled={onEdit.isPending || однакові || порожня}>
              {onEdit.isPending ? 'Зберігаємо…' : 'Зберегти команди'}
            </button>
          </div>
        )}
      </form>
      )}
      <div className="form">
        {матчі.length === 0 &&
          (єСуперник(пара) ? (
            <div className="muted">Матчу між цими командами в раунді ще немає — створіть його у вкладці «Матчі»</div>
          ) : (
            <div className="muted">Команда проходить цей раунд без суперника — матчу не буде</div>
          ))}
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
        <ErrorBox error={onRemove.error || moving.error} />
        <div className="form-actions">
          {крок ? (
            <>
              <button type="button" className="btn small" disabled={moving.isPending || !крок(-1)} onClick={() => onMove(крок(-1))} title="Поставити вище в цьому раунді">
                ▲ Вище
              </button>
              <button type="button" className="btn small" disabled={moving.isPending || !крок(1)} onClick={() => onMove(крок(1))} title="Поставити нижче в цьому раунді">
                ▼ Нижче
              </button>
            </>
          ) : (
            крок === null && <span className="muted small-text">Місце пари задає наступний раунд</span>
          )}
          <span className="spacer" />
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
  const [спроба, setСпроба] = useState(false);
  const порожня = обидвіПорожні(values);
  const однакові = values.teaminfo_id1 && values.teaminfo_id1 === values.teaminfo_id2;
  return (
    <Modal title="Пара сітки" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          setСпроба(true);
          if (порожня || однакові) return;
          onSave.mutate(тілоНовоїПари(values));
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
          <Field label="Команда 1" hint="Порожньо — команда проходить без суперника (бай)">
            <select value={values.teaminfo_id1} onChange={set('teaminfo_id1')}>
              <option value="">— {БЕЗ_СУПЕРНИКА}</option>
              {команди.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Команда 2" hint="Порожньо — команда проходить без суперника (бай)">
            <select value={values.teaminfo_id2} onChange={set('teaminfo_id2')}>
              <option value="">— {БЕЗ_СУПЕРНИКА}</option>
              {команди.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {спроба && порожня && <div className="error-box">Оберіть хоча б одну команду — порожньою може бути лише одна сторона (бай)</div>}
        {однакові && <div className="error-box">Команда не може грати сама з собою</div>}
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
