import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, useForm } from '../components/ui.jsx';
import { підказкаДоЗбереження, статусАрени, статусЗСервера } from '../utils/venueMap.js';

/**
 * Арени. Одне поле `Venues.City`, у якому живуть і місто, і об'єкт одним рядком
 * («м. Бровари, БФСК»). Розділяти його не можна: у такому вигляді арену показує
 * фанатський застосунок у картці матчу, і на нього ж дивиться ADMIN.
 *
 * Посилання з Google Карт (бриф arena-map, п. 2): за ним застосунок показує
 * арену на карті. Координати з посилання дістає сервер — і з короткого
 * maps.app.goo.gl теж, — тож статус у списку береться з Venues.lat/lng, а
 * не з розбору в браузері (src/utils/venueMap.js).
 */
export default function VenuesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['venues'], queryFn: () => crm.get('/venues') });
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');

  const save = useMutation({
    mutationFn: (v) => (v.id ? crm.patch(`/venues/${v.id}`, v.data) : crm.post('/venues', v.data)),
    // Закриває форму сама форма: якщо точку не знайдено, вона лишається
    // відкритою з поясненням сервера
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venues'] });
      // Довідник арен читає ще й форма матчу — щоб нова арена з'явилась там одразу
      qc.invalidateQueries({ queryKey: ['dicts'] });
    },
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = list.data || [];
    return s ? all.filter((v) => String(v.City || '').toLowerCase().includes(s)) : all;
  }, [list.data, q]);

  return (
    <div className="page">
      <PageHeader
        title="Арени"
        subtitle="Місце проведення матчу. Місто й обʼєкт пишуться одним рядком — так само, як їх показує застосунок"
        actions={
          <button className="btn primary" onClick={() => setEditing({})}>
            Нова арена
          </button>
        }
      />
      <ErrorBox error={list.error} />
      <div className="section-bar">
        <input className="search" placeholder="Пошук за назвою або містом" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.data && rows.length === 0 && <Empty>{q ? 'Нічого не знайшлось' : 'Арен ще немає'}</Empty>}
      {rows.length > 0 && (
        <table className="table cards">
          <thead>
            <tr>
              <th>Арена</th>
              <th>Посилання з Google Карт</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="strong">{v.City}</td>
                <td data-label="Карта">
                  <MapStatus {...статусАрени(v)} />
                </td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(v)}>
                    Редагувати
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <VenueForm item={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

// ✓ точку знайдено · ⚠ пошук чи не знайдено · порожнє — як у мокапі
function MapStatus({ тон, текст, href }) {
  return (
    <span className={`map-status ${тон}`}>
      {тон === 'ok' ? '✓ ' : тон === 'warn' ? '⚠ ' : ''}
      {текст}
      {href && (
        <>
          {' · '}
          <a href={href} target="_blank" rel="noreferrer">
            Відкрити
          </a>
        </>
      )}
    </span>
  );
}

function VenueForm({ item, onClose, onSave }) {
  const { values, set } = useForm({ City: item.City || '', map_url: item.map_url || '' });
  const url = values.map_url.trim();
  // Що відповів сервер на щойно збережене посилання: { url, map }
  const [збережено, setЗбережено] = useState(null);
  // Пріоритет: відповідь сервера на саме це посилання → збережений стан арени
  // (посилання не міняли) → підказка до збереження
  const статус =
    збережено && збережено.url === url
      ? статусЗСервера(збережено.map)
      : item.id && url === String(item.map_url || '').trim()
        ? статусАрени(item)
        : підказкаДоЗбереження(url);
  const submit = (e) => {
    e.preventDefault();
    onSave.mutate(
      { id: item.id, data: { City: values.City.trim(), map_url: url } },
      {
        onSuccess: (venue) => {
          const kind = venue?._map?.kind;
          // Точку знайдено чи посилання порожнє — готово. Інакше лишаємо форму з
          // причиною від сервера: «Поділитися» з телефона часто без координат.
          if (!kind || kind === 'place' || kind === 'empty') onClose();
          else setЗбережено({ url, map: venue._map });
        },
      }
    );
  };
  return (
    <Modal title={item.id ? item.City : 'Нова арена'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Назва" hint="Місто й обʼєкт одним рядком: «м. Бровари, БФСК», «м. Львів, ПС «Галичина»»">
          <input value={values.City} onChange={set('City')} required autoFocus />
        </Field>
        <Field label="Посилання з Google Карт" hint="У Google Картах відкрийте арену → «Поділитися» → «Копіювати посилання». Порожнє — застосунок шукатиме арену за назвою">
          <input
            type="url"
            inputMode="url"
            value={values.map_url}
            onChange={set('map_url')}
            placeholder="https://maps.app.goo.gl/…"
          />
        </Field>
        <MapStatus {...статус} />
        {збережено && збережено.url === url && (
          <div className="muted small-text">
            Назву й посилання збережено. Застосунок відкриватиме саме це посилання, без вбудованої карти. Можна вставити
            інше й зберегти ще раз.
          </div>
        )}
        <ErrorBox error={onSave.error} />
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          {/* Коротке посилання сервер розгортає запитами до Google — до кількох
              секунд (контракт Backend: до 3 кроків по ≤ 8 с, зазвичай < 1 с) */}
          <button className="btn primary" disabled={onSave.isPending}>
            {onSave.isPending ? (url ? 'Перевіряємо посилання…' : 'Зберігаємо…') : 'Зберегти'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
