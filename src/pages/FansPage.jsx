import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Modal, PageHeader } from '../components/ui.jsx';
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

const СТОВПЦІ = [
  { key: 'name', label: 'Вболівальник', first: 'asc' },
  { key: 'login', label: 'Вхід', first: 'asc' },
  { key: 'club', label: 'Улюблений клуб', first: 'asc' },
  { key: 'created_at', label: 'Реєстрація', first: 'desc' },
  { key: 'latest_activity', label: 'Остання активність', first: 'desc' },
  { key: 'notifications', label: 'Сповіщення', first: 'desc' },
];

function Плитка({ value, label }) {
  return (
    <div className="fan-stat">
      <div className="fan-stat-value">{value ?? '—'}</div>
      <div className="fan-stat-label">{label}</div>
    </div>
  );
}

// Очистка мертвих анонімних профілів (R38): спершу сервер рахує, хто потрапляє
// під критерій, видалення — лише з тим самим числом. Межа 90 днів — рішення
// Андрія 01.10; менше сервер не прийме.
function Очистка({ onClose }) {
  const qc = useQueryClient();
  const перегляд = useQuery({ queryKey: ['fans-cleanup'], queryFn: () => crm.post('/fans/cleanup', { days: 90 }), gcTime: 0 });
  const видалити = useMutation({
    mutationFn: (expected) => crm.post('/fans/cleanup', { days: 90, confirm: true, expected }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fans'] }),
  });
  const p = перегляд.data;
  return (
    <Modal title="Очистка неактивних профілів" onClose={onClose} width={520}>
      <div className="form">
        <div className="muted">
          Профілі без email, без Google і без Apple, які не відкривали застосунок понад 90 днів. Якщо людина
          повернеться, застосунок заведе їй новий профіль, але обраний клуб і сповіщення доведеться налаштувати знову.
        </div>
        <ErrorBox error={перегляд.error || видалити.error} />
        {перегляд.isLoading && <div className="muted">Рахую…</div>}
        {видалити.isSuccess ? (
          <div className="strong">Видалено профілів: {видалити.data.count}</div>
        ) : (
          p && (
            <div className="danger-box">
              <div className="strong">
                {p.count ? `Під очистку потрапляє профілів: ${p.count}` : 'Таких профілів немає'}
              </div>
              {p.count > 0 && <div className="muted small-text">З них отримують сповіщення: {p.with_notifications}. Видалення назавжди.</div>}
            </div>
          )
        )}
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {видалити.isSuccess ? 'Закрити' : 'Скасувати'}
          </button>
          {!видалити.isSuccess && p?.count > 0 && (
            <button type="button" className="btn danger" disabled={видалити.isPending} onClick={() => видалити.mutate(p.count)}>
              Так, видалити {p.count}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function FansPage() {
  const [очистка, setОчистка] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [сорт, setСорт] = useState({ key: 'created_at', dir: 'desc' });
  const list = useQuery({
    queryKey: ['fans', q, page, сорт.key, сорт.dir],
    queryFn: () => crm.get('/fans', { q: q || undefined, page, per_page: 50, sort: сорт.key, dir: сорт.dir }),
    placeholderData: (prev) => prev,
  });
  const items = list.data?.items || [];
  const s = list.data?.stats;
  const pages = Math.max(1, Math.ceil((list.data?.total || 0) / 50));

  return (
    <div className="page">
      <PageHeader title="Вболівальники" subtitle="Профілі застосунку «Футзал AFU»: з входом через пошту, Google чи Apple і анонімні профілі пристрою" />
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
        <span className="spacer" />
        <button className="btn danger ghost" onClick={() => setОчистка(true)}>
          Очистити неактивні
        </button>
      </div>
      {очистка && <Очистка onClose={() => setОчистка(false)} />}
      <ErrorBox error={list.error} />
      {!list.isLoading && !list.error && items.length === 0 && <Empty>Нікого не знайдено</Empty>}
      {items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              {СТОВПЦІ.map((c) => (
                <th key={c.key} aria-sort={сорт.key === c.key ? (сорт.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    className={`th-sort ${сорт.key === c.key ? 'active' : ''}`}
                    onClick={() => {
                      // Перший клік: дати й сповіщення — спершу нові / увімкнені, текст — від А
                      setСорт((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.first }));
                      setPage(1);
                    }}
                  >
                    {c.label}
                    <span className="th-sort-arrow" aria-hidden="true">
                      {сорт.key === c.key ? (сорт.dir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
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
