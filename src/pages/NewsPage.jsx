import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, PageHeader } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';
import { СТАТУСИ, стан } from '../utils/newsStatus.js';

export default function NewsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [category_id, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const cats = useQuery({ queryKey: ['news-categories'], queryFn: () => crm.get('/news-categories') });
  const list = useQuery({
    queryKey: ['news', q, category_id, status, page],
    queryFn: () => crm.get('/news', { q, category_id: category_id || undefined, status: status || undefined, page, per_page: 50 }),
    placeholderData: (prev) => prev,
  });
  const items = list.data?.items || [];
  const pages = Math.max(1, Math.ceil((list.data?.total || 0) / 50));

  return (
    <div className="page">
      <PageHeader
        title="Новини"
        subtitle="Новини для сайту futsal.com.ua. Сайт показує лише опубліковані з датою, що вже настала; чернетки й відкладені не видно"
        actions={
          <>
            <Link className="btn" to="/news-categories">
              Рубрики
            </Link>
            <button className="btn primary" onClick={() => nav('/news/new')}>
              Нова новина
            </button>
          </>
        }
      />
      <div className="section-bar">
        <input
          className="search"
          placeholder="Пошук за заголовком чи анонсом"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={category_id}
          onChange={(e) => {
            setCat(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Усі рубрики</option>
          {(cats.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Усі статуси</option>
          {Object.entries(СТАТУСИ).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox error={list.error || cats.error} />
      {!list.isLoading && items.length === 0 && <Empty>Новин не знайдено</Empty>}
      {items.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Новина</th>
              <th>Рубрика</th>
              <th>Стан</th>
            </tr>
          </thead>
          <tbody>
            {items.map((n) => {
              const s = стан(n);
              return (
                <tr key={n.id}>
                  <td className="muted nowrap">{kyivDateTimeString(n.published_at || n.updated_at || n.created_at)}</td>
                  <td>
                    <Link to={`/news/${n.id}`} className="club-cell">
                      {n.cover?.url ? <img src={n.cover.url} alt="" className="news-thumb" /> : <span className="news-thumb logo-empty" />}
                      <span>
                        <span className="strong">{n.title}</span>
                        {n.is_featured && <span className="badge brand">на головній</span>}
                        <br />
                        <span className="muted small-text">{n.lead}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="muted">{n._category?.name || '—'}</td>
                  <td>
                    <span className={`badge news-${s.key}`}>{s.label}</span>
                  </td>
                </tr>
              );
            })}
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
