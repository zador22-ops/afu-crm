import { useQuery } from '@tanstack/react-query';
import { club } from '../../api/client.js';
import { ErrorBox, PageHeader } from '../../components/ui.jsx';

// Поля картки клубу (ТЗ 2.1) — підписи як у CRM АФУ
const ПОЛЯ = [
  ['TeamInfo', 'Про клуб'],
  ['founded_year', 'Рік заснування'],
  ['website', 'Сайт'],
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['youtube', 'YouTube'],
  ['contact_name', 'Контактна особа'],
  ['contact_phone', 'Телефон'],
  ['contact_email', 'Пошта'],
];

/**
 * «Мій клуб» (1.3) — поки лише перегляд картки свого клубу
 * (GET crm/club/clubs/{id}, сторож «лише свій клуб» на сервері).
 * Редагування через заявки на погодження АФУ — етап 2.
 */
export default function MyClubPage({ teaminfoId }) {
  const q = useQuery({ queryKey: ['club-card', teaminfoId], queryFn: () => club.get(`/clubs/${teaminfoId}`) });
  const c = q.data;
  const фото = (img) => img?.url || null;

  return (
    <>
      <PageHeader
        title={c?.TeamName || 'Мій клуб'}
        subtitle="Картка клубу, як її бачать на сайті й у застосунку. Змінювати через заявки на погодження АФУ можна буде незабаром"
      />
      <ErrorBox error={q.error} />
      {q.isPending && <div className="center muted">Завантаження…</div>}
      {c && (
        <section className="card-form my-club">
          <div className="my-club-head">
            {фото(c.TeamLogo) ? <img src={фото(c.TeamLogo)} alt="Емблема" className="my-club-logo" /> : <div className="logo-empty my-club-logo" />}
            {фото(c.TeamPhoto) && <img src={фото(c.TeamPhoto)} alt="Фото команди" className="my-club-photo" />}
          </div>
          <dl className="my-club-fields">
            {ПОЛЯ.map(([ключ, підпис]) => (
              <div key={ключ}>
                <dt>{підпис}</dt>
                <dd>{c[ключ] ? String(c[ключ]) : <span className="muted">не заповнено</span>}</dd>
              </div>
            ))}
            <div>
              <dt>Кольори форми</dt>
              <dd>
                {c.kit_color_primary || c.kit_color_secondary ? (
                  [c.kit_color_primary, c.kit_color_secondary].filter(Boolean).map((колір) => (
                    <span key={колір} className="kit-swatch" style={{ background: колір }} title={колір} />
                  ))
                ) : (
                  <span className="muted">не заповнено</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Домашня арена</dt>
              <dd>{c.home_venues_id ? 'обрано' : <span className="muted">не заповнено</span>}</dd>
            </div>
          </dl>
        </section>
      )}
    </>
  );
}
