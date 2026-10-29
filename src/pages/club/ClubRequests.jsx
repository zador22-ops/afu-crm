import { useQuery } from '@tanstack/react-query';
import { club } from '../../api/client.js';
import { Empty, ErrorBox } from '../../components/ui.jsx';
import { kyivDateTimeString } from '../../utils/kyivTime.js';
import { назваЗаявки, підсумокПакета, статусЗаявки, зміниЗаявки } from '../../utils/clubRequests.js';

const ПАКЕТ = { submitted: 'на погодженні', withdrawn: 'відкликано', closed: 'розглянуто' };

/**
 * Вкладка «Заявки» кабінету клубу (самообслуговування клубів, 2.3): усі
 * надіслані пакети, по кожній заявці — статус, «було → стане» і коментар
 * АФУ; повернуту заявку клуб виправляє в картці/складі й надсилає знову.
 * Окремо — гравці, яких забрали переходом в інший клуб (рішення Андрія 8.4).
 */
export default function ClubRequests({ teaminfoId }) {
  const q = useQuery({ queryKey: ['club-requests', teaminfoId], queryFn: () => club.get(`/clubs/${teaminfoId}/requests`) });
  const д = q.data;
  return (
    <section className="club-requests">
      <ErrorBox error={q.error} />
      {q.isPending && <div className="center muted">Завантаження…</div>}
      {д && д.batches.length === 0 && д.transfers_out.length === 0 && <Empty>Ще нічого не надсилали на погодження</Empty>}
      {д?.transfers_out?.length > 0 && (
        <div className="request-batch">
          <h3>Виведені переходом</h3>
          {д.transfers_out.map((t) => (
            <div key={t.id} className="request-row">
              <span className="strong">{t.person_name || 'гравець'}</span>
              <span className="muted">
                {' '}
                → «{t.to_club || 'інший клуб'}»{t.league_name ? ` · ${t.league_name}` : ''} · {t.applied_at ? kyivDateTimeString(t.applied_at) : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {д?.batches.map((b) => (
        <div key={b.id} className="request-batch">
          <div className="section-bar">
            <h3>Пакет від {kyivDateTimeString(b.submitted_at)}</h3>
            <span className={`badge ${b.status === 'withdrawn' ? 'warn' : ''}`}>{ПАКЕТ[b.status] || b.status}</span>
            <span className="spacer" />
            <span className="muted small-text">{підсумокПакета(b.requests)}</span>
          </div>
          {b.by_afu && <div className="muted small-text">Надіслала АФУ від імені клубу</div>}
          {b.club_comment && <div className="muted small-text">Ваш коментар: {b.club_comment}</div>}
          {b.requests.map((r) => {
            const с = статусЗаявки(r.status);
            return (
              <div key={r.id} className="request-row">
                <div className="request-head">
                  <span className="strong">{назваЗаявки(r)}</span>
                  <span className={`request-status ${с.тон}`}>{с.текст}</span>
                </div>
                <ul className="request-changes">
                  {зміниЗаявки(r).map((з) => (
                    <li key={з.key}>
                      <span className="muted">{з.label}:</span>{' '}
                      {з.фото ? (
                        <>
                          {з.фото.було && <img src={з.фото.було} alt="було" className="request-img" />} →{' '}
                          <img src={з.фото.стане} alt="стане" className="request-img" />
                        </>
                      ) : (
                        <>
                          {з.було !== '—' && <s className="muted">{з.було}</s>} {з.стане}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {r.decision_comment && (
                  <div className={r.status === 'rejected' ? 'error-box' : 'muted small-text'}>Коментар АФУ: {r.decision_comment}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
