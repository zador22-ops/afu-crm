import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, PageHeader } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';
import { групи, кількість, підсумок } from '../utils/dataIssues.js';

/**
 * «Проблеми з даними» (бриф crm-data-issues, слово Андрія 23.10): перевірка
 * даних поточного сезону на сервері (GET crm/data-issues — лише читання), три
 * рівні, у кожній перевірці — що бачить уболівальник, як виправити й список
 * посилань туди, де це виправляється. Перевірка — лише за кнопкою: вона
 * читає весь сезон, тож сама собою не запускається.
 */
export default function DataIssuesPage() {
  const q = useQuery({
    queryKey: ['data-issues'],
    queryFn: () => crm.get('/data-issues'),
    enabled: false,
    staleTime: Infinity,
  });
  const д = q.data;

  return (
    <div className="page">
      <PageHeader
        title="Проблеми з даними"
        subtitle="Перевірка даних поточного сезону: чого бракує і що виглядає неправильно. Лише читає — нічого не змінює"
        actions={
          <button className="btn primary" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? 'Перевіряємо…' : д ? 'Перевірити ще раз' : 'Запустити перевірку'}
          </button>
        }
      />
      <ErrorBox error={q.error} />
      {!д && !q.isFetching && <Empty>Натисніть «Запустити перевірку» — це займе кілька секунд</Empty>}
      {д && (
        <>
          <div className="muted small-text issues-meta">
            {[д.season?.name && `Сезон ${д.season.name}`, д.checked_at && `перевірено ${kyivDateTimeString(д.checked_at)}`, підсумок(д.checks)]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {!д.season && <Empty>Поточний сезон не позначено — перевіряти нічого</Empty>}
          {групи(д.checks).map(
            (г) =>
              г.перевірки.length > 0 && (
                <details key={г.level} className={`issues-group ${г.level}`} open={г.проблем > 0}>
                  <summary>
                    <span className="issues-level">{г.назва}</span>
                    <span className="muted small-text">{г.опис}</span>
                    <span className="spacer" />
                    <span className={г.проблем ? 'issues-count' : 'issues-ok'}>{г.проблем ? г.проблем : '✓ Усе гаразд'}</span>
                  </summary>
                  {г.перевірки.map((c) => (
                    <Check key={c.code} c={c} />
                  ))}
                </details>
              )
          )}
        </>
      )}
    </div>
  );
}

function Check({ c }) {
  if (!c.count) {
    return (
      <div className="issues-check ok">
        <span>{c.title}</span>
        <span className="issues-ok">✓ Усе гаразд</span>
      </div>
    );
  }
  return (
    <details className="issues-check">
      <summary>
        <span className="strong">{c.title}</span>
        <span className="spacer" />
        <span className="issues-count">{кількість(c)}</span>
      </summary>
      <div className="issues-body">
        <p>
          <span className="muted">Що бачить уболівальник: </span>
          {c.seen}
        </p>
        <p>
          <span className="muted">Як виправити: </span>
          {c.fix}
        </p>
        <ul className="issues-items">
          {c.items.map((i) => (
            <li key={`${i.type}:${i.id}:${i.label}`}>
              <Link to={i.link}>{i.label}</Link>
              {i.sub && <span className="muted small-text"> · {i.sub}</span>}
            </li>
          ))}
        </ul>
        {c.truncated && <div className="muted small-text">Показано перші {c.items.length} з {c.count}</div>}
      </div>
    </details>
  );
}
