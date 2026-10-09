import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, PageHeader, Tabs } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';

// «Влуч у ворота», 4.2 (ТЗ docs/proposals/mini-game.md, розділ 11) на ендпоінтах
// game-admin/* (право 20). Модерація ніків і результатів, переможці, скарги,
// відхилені захистом партії, заборонені слова. Підтвердження — у самій сторінці:
// вбудований браузер блокує window.confirm.

export default function GamePage() {
  const [tab, setTab] = useState('month');
  return (
    <div className="page">
      <PageHeader title="Влуч у ворота" subtitle="Міні-гра в застосунку: рейтинг місяця, переможці, скарги на ніки й захист від накруток" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'month', label: 'Місяць' },
          { key: 'winners', label: 'Переможці і Зал слави' },
          { key: 'reports', label: 'Скарги' },
          { key: 'rejected', label: 'Відхилені партії' },
          { key: 'words', label: 'Заборонені слова' },
        ]}
      />
      {tab === 'month' && <Month />}
      {tab === 'winners' && <Winners />}
      {tab === 'reports' && <Reports />}
      {tab === 'rejected' && <Rejected />}
      {tab === 'words' && <Words />}
    </div>
  );
}

const ніка = (n) => (n ? <span className="strong">{n}</span> : <span className="muted">нік скинуто</span>);

/** Кнопка з підтвердженням у самому рядку: перший клік — «Точно?», другий — дія. */
function Confirm({ label, confirm, onDo, busy, danger }) {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button className={`btn small ${danger ? 'danger ghost' : ''}`} onClick={() => setAsk(true)} disabled={busy}>
        {label}
      </button>
    );
  return (
    <span className="confirm-inline">
      <span className="small-text">{confirm}</span>
      <button className="btn small danger" disabled={busy} onClick={() => { setAsk(false); onDo(); }}>
        Так
      </button>
      <button className="btn small" onClick={() => setAsk(false)}>
        Ні
      </button>
    </span>
  );
}

function useAct(keys) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method, path, body }) => (method === 'DELETE' ? crm.del(path) : crm.post(path, body || {})),
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
  });
}

function Month() {
  const [month, setMonth] = useState('');
  const q = useQuery({ queryKey: ['game-month', month], queryFn: () => crm.get('/game-admin/month', { month: month || undefined }) });
  const act = useAct([['game-month'], ['game-reports']]);
  const d = q.data;
  return (
    <section>
      <div className="section-bar">
        <input className="ver-input" placeholder={d?.current_month || '2026-10'} value={month} onChange={(e) => setMonth(e.target.value.trim())} aria-label="Місяць" />
        {d && (
          <span className="muted">
            {d.month === d.current_month ? 'Поточний місяць' : `Місяць ${d.month}`} · гравців {d.players}, у рейтингу {d.visible}
            {d.month === d.current_month && d.month_ends_at ? ` · закриття ${kyivDateTimeString(d.month_ends_at)}` : ''}
          </span>
        )}
      </div>
      <ErrorBox error={q.error || act.error} />
      {d && d.rows.length === 0 && <Empty>За цей місяць ще ніхто не грав</Empty>}
      {d?.rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Місце</th>
              <th>Нік</th>
              <th>Рекорд</th>
              <th>Голи</th>
              <th>Партій</th>
              <th>Коли</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id} className={r.hidden || r.banned ? 'muted' : ''}>
                <td className="num">{r.place ?? '—'}</td>
                <td>
                  {ніка(r.nick)}
                  {r.hidden && <span className="badge warn">сховано</span>}
                  {r.banned && <span className="badge warn">заблоковано</span>}
                  {r.reports > 0 && <span className="badge">скарг {r.reports}</span>}
                </td>
                <td className="num strong">{r.score}</td>
                <td className="num">
                  {r.goals}
                  {r.ricochet_goals ? <span className="muted small-text"> (рикошет {r.ricochet_goals})</span> : null}
                </td>
                <td className="num">{r.games_played}</td>
                <td className="muted nowrap">{kyivDateTimeString(r.achieved_at)}</td>
                <td className="row-actions">
                  {r.hidden ? (
                    <button className="btn small" disabled={act.isPending} onClick={() => act.mutate({ path: `/game-admin/month-best/${r.id}/hide`, body: { hidden: false } })}>
                      Показати
                    </button>
                  ) : (
                    <Confirm label="Сховати" confirm="Сховати результат?" busy={act.isPending} onDo={() => act.mutate({ path: `/game-admin/month-best/${r.id}/hide`, body: { hidden: true } })} />
                  )}
                  {r.fans_id && r.nick && (
                    <Confirm label="Скинути нік" confirm="Скинути нік?" danger busy={act.isPending} onDo={() => act.mutate({ path: `/game-admin/fans/${r.fans_id}/nick-reset` })} />
                  )}
                  {r.fans_id &&
                    (r.banned ? (
                      <button className="btn small" disabled={act.isPending} onClick={() => act.mutate({ path: `/game-admin/fans/${r.fans_id}/ban`, body: { banned: false } })}>
                        Розблокувати
                      </button>
                    ) : (
                      <Confirm label="Заблокувати" confirm="Прибрати з рейтингу?" danger busy={act.isPending} onDo={() => act.mutate({ path: `/game-admin/fans/${r.fans_id}/ban`, body: { banned: true } })} />
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small-text">
        «Сховати» прибирає лише цей результат місяця. «Заблокувати» прибирає гравця з усіх рейтингів, доки не розблокуєте.
        «Скинути нік» — гравець обере новий.
      </p>
    </section>
  );
}

function Winners() {
  const q = useQuery({ queryKey: ['game-winners'], queryFn: () => crm.get('/game-admin/winners') });
  const act = useAct([['game-winners'], ['game-month']]);
  const d = q.data;
  return (
    <section>
      <ErrorBox error={q.error || act.error} />
      {act.data?.note && <div className="muted-box">{act.data.note}</div>}
      <h3 className="section-title">Переможці місяців</h3>
      {d && d.winners.length === 0 && <Empty>Переможців ще немає — перший обереться після закриття місяця</Empty>}
      {d?.winners.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Місяць</th>
              <th>Переможець</th>
              <th>Очки</th>
              <th>Сезон</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {d.winners.map((w) => (
              <tr key={w.id}>
                <td className="strong nowrap">{w.month}</td>
                <td>{w.fans_id ? w.nick_snapshot || '—' : <span className="muted">Колишній гравець</span>}</td>
                <td className="num">{w.score}</td>
                <td className="muted">{w.season}</td>
                <td className="row-actions">
                  {w.can_redefine && (
                    <Confirm
                      label="Перевизначити переможця"
                      confirm={`Сховати результат і обрати нового${w.month.endsWith('-08') ? ' (і перерахувати Зал слави)' : ''}?`}
                      danger
                      busy={act.isPending}
                      onDo={() => act.mutate({ path: '/game-admin/winners/redefine', body: { month: w.month } })}
                    />
                  )}
                  <Confirm label="Зняти запис" confirm="Зняти запис переможця?" danger busy={act.isPending} onDo={() => act.mutate({ method: 'DELETE', path: `/game-admin/winners/${w.id}` })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small-text">
        «Перевизначити» доступне 7 днів після закриття місяця: результат переможця ховається, новий обереться найближчим
        щогодинним запуском. Після 7 днів рядків місяця вже немає — лишається лише «Зняти запис».
      </p>
      <h3 className="section-title">Зал слави</h3>
      {d && d.hall.length === 0 && <Empty>Сезонів ще не закрито</Empty>}
      {d?.hall.length > 0 && (
        <table className="table compact">
          <tbody>
            {d.hall.map((h) => (
              <tr key={h.id}>
                <td className="strong">{h.season}</td>
                <td>{h.fans_id ? h.nick_snapshot || '—' : <span className="muted">Колишній гравець</span>}</td>
                <td className="num">{h.score}</td>
                <td className="muted">{h.month}</td>
                <td className="row-actions">
                  <Confirm label="Зняти запис" confirm="Зняти з Залу слави?" danger busy={act.isPending} onDo={() => act.mutate({ method: 'DELETE', path: `/game-admin/hall/${h.id}` })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Reports() {
  const q = useQuery({ queryKey: ['game-reports'], queryFn: () => crm.get('/game-admin/reports') });
  const act = useAct([['game-reports'], ['game-month']]);
  return (
    <section>
      <ErrorBox error={q.error || act.error} />
      {q.data?.length === 0 && <Empty>Скарг немає</Empty>}
      {q.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Коли</th>
              <th>На нік</th>
              <th>Зараз</th>
              <th>Усього скарг</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((r) => (
              <tr key={r.id}>
                <td className="muted nowrap">{kyivDateTimeString(r.created_at)}</td>
                <td className="strong">{r.nick_snapshot || '—'}</td>
                <td>
                  {ніка(r.current_nick)}
                  {r.banned && <span className="badge warn">заблоковано</span>}
                </td>
                <td className="num">{r.reports_on_target}</td>
                <td className="row-actions">
                  {r.target_fans_id && r.current_nick && (
                    <Confirm label="Скинути нік" confirm="Скинути нік?" danger busy={act.isPending} onDo={() => act.mutate({ path: `/game-admin/fans/${r.target_fans_id}/nick-reset` })} />
                  )}
                  {r.target_fans_id && !r.banned && (
                    <Confirm label="Заблокувати" confirm="Прибрати з рейтингу?" danger busy={act.isPending} onDo={() => act.mutate({ path: `/game-admin/fans/${r.target_fans_id}/ban`, body: { banned: true } })} />
                  )}
                  <button className="btn small" disabled={act.isPending} onClick={() => act.mutate({ method: 'DELETE', path: `/game-admin/reports/${r.id}` })}>
                    Розглянуто
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small-text">«Розглянуто» прибирає скаргу зі списку. Той самий вболівальник зможе поскаржитись знову.</p>
    </section>
  );
}

function Rejected() {
  const q = useQuery({ queryKey: ['game-rejected'], queryFn: () => crm.get('/game-admin/sessions/rejected') });
  const [open, setOpen] = useState(null);
  return (
    <section>
      <ErrorBox error={q.error} />
      {q.data?.length === 0 && <Empty>Відхилених партій немає</Empty>}
      {q.data?.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Коли</th>
              <th>Гравець</th>
              <th>Причина</th>
              <th>Ударів</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((s) => (
              <Fragment key={s.id}>
                <tr>
                  <td className="muted nowrap">{kyivDateTimeString(s.started_at)}</td>
                  <td>{ніка(s.nick)}</td>
                  <td>{s.reject_reason || '—'}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                      {s.shots_count}
                    </button>
                  </td>
                </tr>
                {open === s.id && (
                  <tr>
                    <td colSpan={4}>
                      <pre className="error-stack">{JSON.stringify(s.shots_list, null, 1)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small-text">Партії, які сервер не зарахував як неправдоподібні. Зберігаються 7 днів.</p>
    </section>
  );
}

function Words() {
  const q = useQuery({ queryKey: ['game-words'], queryFn: () => crm.get('/game-admin/banned-words') });
  const act = useAct([['game-words']]);
  const [word, setWord] = useState('');
  const [kind, setKind] = useState('substring');
  const [filter, setFilter] = useState('');
  const list = (q.data || []).filter((w) => !filter || w.word.includes(filter.toLowerCase()));
  return (
    <section>
      <form
        className="section-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (word.trim()) act.mutate({ path: '/game-admin/banned-words', body: { word: word.trim(), kind } }, { onSuccess: () => setWord('') });
        }}
      >
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Нове слово" aria-label="Нове заборонене слово" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Вид">
          <option value="substring">усередині ніку</option>
          <option value="exact">нік цілком</option>
        </select>
        <button className="btn primary" disabled={act.isPending || !word.trim()}>
          Додати
        </button>
        <span className="spacer" />
        <input className="search" placeholder="Пошук у списку" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </form>
      <ErrorBox error={q.error || act.error} />
      {q.data && <div className="muted small-text">Слів у списку: {q.data.length}</div>}
      {list.length > 0 && (
        <table className="table compact">
          <tbody>
            {list.map((w) => (
              <tr key={w.id}>
                <td className="strong">{w.word}</td>
                <td className="muted">{w.kind === 'exact' ? 'нік цілком' : 'усередині ніку'}</td>
                <td className="row-actions">
                  <Confirm label="Прибрати" confirm="Прибрати слово?" danger busy={act.isPending} onDo={() => act.mutate({ method: 'DELETE', path: `/game-admin/banned-words/${w.id}` })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small-text">
        Нік порівнюється за «скелетом»: регістр, латиниця-двійники й розділювачі не рахуються, тож «х_у_й» окремо додавати не
        треба. Короткі слова, що трапляються в чесних ніках, додавайте як «нік цілком».
      </p>
    </section>
  );
}
