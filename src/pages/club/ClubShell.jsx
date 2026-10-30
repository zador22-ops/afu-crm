import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { club } from '../../api/client.js';
import { useClub } from '../../auth/ClubContext.jsx';
import { обранийКлуб, обранийКлубЗбережений, хвилинЛишилось } from '../../auth/clubSession.js';
import { ErrorBox } from '../../components/ui.jsx';
import MyClubPage from './MyClubPage.jsx';
import SubmitBar from './SubmitBar.jsx';
import ClubRequests from './ClubRequests.jsx';
import ClubSquad from './ClubSquad.jsx';
import ClubStaff from './ClubStaff.jsx';
import { Tabs } from '../../components/ui.jsx';

/**
 * Кабінет клубу (1.3): лише свій клуб, жодних розділів АФУ. Фарм-клуб —
 * перемикач клубу вгорі (рішення Андрія 8.2). Адмін «як клуб» бачить помітну
 * смугу з виходом; токен АФУ лежить окремо й повертається після виходу.
 */
export default function ClubShell() {
  const { session, exit } = useClub();
  const me = useQuery({ queryKey: ['club-me'], queryFn: () => club.get('/me') });
  const [вибір, setВибір] = useState(() => обранийКлубЗбережений.get());
  // Вкладки кабінету: картка, заявки; склад і штаб — етап 3
  const [вкладка, setВкладка] = useState('card');
  const clubs = me.data?.clubs || [];
  const поточний = обранийКлуб(clubs, вибір);
  const назва = clubs.find((c) => c.teaminfo_id === поточний)?.name || '';

  // Куди далі, вирішує захист маршрутів в App (clubSession.перенаправлення):
  // Адмін — на «Акаунти клубів», представник — на вхід клубу
  const вийти = () => exit();

  return (
    <div className="club-shell">
      {session?.as_admin && (
        <div className="as-club-bar" role="status">
          <span>
            Ви в кабінеті клубу <strong>{назва || session.account?.name}</strong> як Адмін · ще {хвилинЛишилось(session)} хв
          </span>
          <button className="btn small" onClick={вийти}>
            Вийти з кабінету
          </button>
        </div>
      )}
      <header className="club-topbar">
        <div className="brand">
          <img src="/logo-mark.png" alt="" className="brand-logo" />
          <span className="brand-mark">АФУ</span>
          <span className="brand-sub">Кабінет клубу</span>
        </div>
        {clubs.length > 1 && (
          <label className="club-switch">
            <span className="muted small-text">Клуб</span>
            <select
              value={поточний ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                setВибір(id);
                обранийКлубЗбережений.set(id);
              }}
            >
              {clubs.map((c) => (
                <option key={c.teaminfo_id} value={c.teaminfo_id}>
                  {c.name || `клуб ${c.teaminfo_id}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" />
        {!session?.as_admin && (
          <>
            <span className="muted small-text club-account">{me.data?.account?.name}</span>
            <button className="btn small" onClick={вийти}>
              Вийти
            </button>
          </>
        )}
      </header>
      <main className="page">
        <ErrorBox error={me.error} />
        {me.isPending && <div className="center muted">Завантаження…</div>}
        {me.data && !поточний && <div className="warn-box">Акаунт не прив'язаний до жодного клубу. Зверніться до АФУ</div>}
        {поточний && <SubmitBar key={`s${поточний}`} teaminfoId={поточний} />}
        {поточний && (
          <Tabs
            value={вкладка}
            onChange={setВкладка}
            tabs={[
              { key: 'card', label: 'Картка' },
              { key: 'squad', label: 'Склад' },
              { key: 'staff', label: 'Штаб' },
              { key: 'requests', label: 'Заявки' },
            ]}
          />
        )}
        {поточний && вкладка === 'card' && <MyClubPage key={поточний} teaminfoId={поточний} />}
        {поточний && вкладка === 'squad' && <ClubSquad key={`q${поточний}`} teaminfoId={поточний} />}
        {поточний && вкладка === 'staff' && <ClubStaff key={`t${поточний}`} teaminfoId={поточний} />}
        {поточний && вкладка === 'requests' && <ClubRequests key={`r${поточний}`} teaminfoId={поточний} />}
      </main>
    </div>
  );
}
