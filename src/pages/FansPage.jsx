import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, PageHeader } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';

// Вболівальники застосунку «Футзал AFU» — лише перегляд (R36). Сервер не
// віддає ні кодів входу, ні push-токенів, ні ідентифікаторів Google чи Apple:
// спосіб входу приходить уже висновком. Без email і без Google/Apple —
// анонімний профіль пристрою: застосунок заводить його сам при першому запуску.
const ВХІД = { google: 'Google', apple: 'Apple', email: 'Код на пошту' };

// latest_activity — поле типу date, приходить рядком YYYY-MM-DD
const дата = (v) => {
  if (!v) return '—';
  if (typeof v === 'number') return kyivDateTimeString(v).slice(0, 10);
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v);
};

function Плитка({ value, label }) {
  return (
    <div className="fan-stat">
      <div className="fan-stat-value">{value ?? '—'}</div>
      <div className="fan-stat-label">{label}</div>
    </div>
  );
}

export default function FansPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['fans', q, page],
    queryFn: () => crm.get('/fans', { q: q || undefined, page, per_page: 50 }),
    placeholderData: (prev) => prev,
  });
  const items = list.data?.items || [];
  const s = list.data?.stats;
  const pages = Math.max(1, Math.ceil((list.data?.total || 0) / 50));

  return (
    <div className="page">
      <PageHeader title="Вболівальники" subtitle="Ті, хто зареєструвався в застосунку «Футзал AFU». Лише перегляд" />
      {s && (
        <div className="fan-stats">
          <Плитка value={s.total} label="усього" />
          <Плитка value={s.new_7} label="нових за 7 днів" />
          <Плитка value={s.new_30} label="нових за 30 днів" />
          <Плитка value={s.active_30} label="активних за 30 днів" />
          <Плитка value={s.notifications} label="зі сповіщеннями" />
        </div>
      )}
      <div className="section-bar">
        <input
          className="search"
          placeholder="Пошук за іменем чи email"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        {list.data && q && <span className="muted">Знайдено: {list.data.total}</span>}
      </div>
      <ErrorBox error={list.error} />
      {!list.isLoading && !list.error && items.length === 0 && <Empty>Нікого не знайдено</Empty>}
      {items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Вболівальник</th>
              <th>Вхід</th>
              <th>Улюблений клуб</th>
              <th>Реєстрація</th>
              <th>Остання активність</th>
              <th>Сповіщення</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id}>
                <td>
                  <span className="strong">{f.full_name || '—'}</span>
                  <br />
                  <span className="muted small-text">{f.email || 'без email'}</span>
                </td>
                <td className="muted">{f.login === 'email' && !f.email ? 'Без входу' : ВХІД[f.login] || f.login}</td>
                <td className="muted">{f.club?.name || '—'}</td>
                <td className="muted nowrap">{kyivDateTimeString(f.created_at)}</td>
                <td className="muted nowrap">{дата(f.latest_activity)}</td>
                <td>{f.send_notifications ? 'увімкнені' : <span className="muted">вимкнені</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <div className="section-bar">
          <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Попередні
          </button>
          <span className="muted">
            Сторінка {page} з {pages}
          </span>
          <button className="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Наступні →
          </button>
        </div>
      )}
    </div>
  );
}
