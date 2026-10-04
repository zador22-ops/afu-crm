import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, PageHeader } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';

// R56. Необроблені помилки застосунку «Футзал АФУ», згруповані за текстом.
// Лише читання. Пише їх сам застосунок (POST app/client_errors) — без даних
// людини: e-mail і токени сервер вирізає ще до запису.
const ПЕРІОДИ = [
  { v: 1, label: 'За добу' },
  { v: 7, label: 'За тиждень' },
  { v: 30, label: 'За 30 днів' },
  { v: 0, label: 'За весь час' },
];

const розклад = (o) =>
  Object.entries(o || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} — ${n}`)
    .join(', ') || '—';

export default function ClientErrorsPage() {
  const [days, setDays] = useState(7);
  const [platform, setPlatform] = useState('');
  const [app_version, setVersion] = useState('');
  const [відкрито, setВідкрито] = useState(null);
  const list = useQuery({
    queryKey: ['client-errors', days, platform, app_version],
    queryFn: () => crm.get('/client_errors', { days, platform: platform || undefined, app_version: app_version || undefined }),
    placeholderData: (prev) => prev,
  });
  const d = list.data;

  return (
    <div className="page">
      <PageHeader title="Помилки застосунку" subtitle="Необроблені помилки «Футзал АФУ» на телефонах уболівальників, згруповані за текстом. Лише перегляд" />
      <div className="section-bar">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {ПЕРІОДИ.map((p) => (
            <option key={p.v} value={p.v}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">iOS і Android</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
        </select>
        <select value={app_version} onChange={(e) => setVersion(e.target.value)}>
          <option value="">Усі версії</option>
          {(d?.versions || []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {d && (
          <span className="muted">
            Усього {d.total}, з них падінь {d.fatal}
          </span>
        )}
      </div>
      <ErrorBox error={list.error} />
      {d && d.groups.length === 0 && <Empty>За цей період помилок немає</Empty>}
      {d?.groups.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Помилка</th>
              <th>Разів</th>
              <th>Версії</th>
              <th>Платформи</th>
              <th>Остання</th>
            </tr>
          </thead>
          <tbody>
            {d.groups.map((g) => (
              <ErrorGroup key={g.message} g={g} open={відкрито === g.message} onToggle={() => setВідкрито(відкрито === g.message ? null : g.message)} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ErrorGroup({ g, open, onToggle }) {
  return (
    <>
      <tr>
        <td>
          <button type="button" className="link-button strong" onClick={onToggle} aria-expanded={open}>
            {g.message}
          </button>
          {g.fatal > 0 && <span className="badge warn">падінь {g.fatal}</span>}
          <div className="muted small-text">Екрани: {розклад(g.screens)}</div>
        </td>
        <td className="num">{g.count}</td>
        <td className="muted">{розклад(g.versions)}</td>
        <td className="muted">{розклад(g.platforms)}</td>
        <td className="muted nowrap">{kyivDateTimeString(g.last_at)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            {g.stack && <pre className="error-stack">{g.stack}</pre>}
            <table className="table compact">
              <thead>
                <tr>
                  <th>Коли</th>
                  <th>Платформа</th>
                  <th>Версія</th>
                  <th>Система</th>
                  <th>Екран</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {g.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{kyivDateTimeString(r.at || r.created_at)}</td>
                    <td>{r.platform}</td>
                    <td>
                      {r.app_version || '—'}
                      {r.build ? ` (${r.build})` : ''}
                    </td>
                    <td>{r.os_version || '—'}</td>
                    <td>{r.screen || '—'}</td>
                    <td>{r.is_fatal ? <span className="badge warn">падіння</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {g.count > g.recent.length && <div className="muted small-text">Показано останні {g.recent.length} з {g.count}</div>}
          </td>
        </tr>
      )}
    </>
  );
}
