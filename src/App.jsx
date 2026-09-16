import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, РОЛІ } from './auth/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SeasonsPage from './pages/SeasonsPage.jsx';
import SeasonPage from './pages/SeasonPage.jsx';
import TournamentPage from './pages/TournamentPage.jsx';
import CompetitionsPage from './pages/CompetitionsPage.jsx';
import ClubsPage from './pages/ClubsPage.jsx';
import ClubPage from './pages/ClubPage.jsx';
import PeoplePage from './pages/PeoplePage.jsx';
import JudgesPage from './pages/JudgesPage.jsx';
import VenuesPage from './pages/VenuesPage.jsx';
import MatchPage from './pages/MatchPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const NAV = [
  { to: '/seasons', label: 'Сезони' },
  { to: '/competitions', label: 'Змагання' },
  { to: '/clubs', label: 'Клуби' },
  { to: '/people', label: 'Особи' },
  { to: '/judges', label: 'Судді' },
  { to: '/venues', label: 'Арени' },
  { to: '/users', label: 'Користувачі' },
  { to: '/settings', label: 'Службове' },
];

function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">АФУ</span>
          <span className="brand-sub">CRM</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user">
            <div className="user-name">{user?.Name || `Користувач ${user?.id ?? ''}`}</div>
            <div className="user-role">{РОЛІ[user?.types_of_user_roles_id] || 'роль не визначена'}</div>
          </div>
          <button className="btn ghost" onClick={logout}>
            Вийти
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <div className="center muted">Завантаження…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/seasons" replace />} />
        <Route path="/login" element={<Navigate to="/seasons" replace />} />
        <Route path="/seasons" element={<SeasonsPage />} />
        <Route path="/seasons/:id" element={<SeasonPage />} />
        <Route path="/tournaments/:id" element={<TournamentPage />} />
        <Route path="/competitions" element={<CompetitionsPage />} />
        <Route path="/clubs" element={<ClubsPage />} />
        <Route path="/clubs/:id" element={<ClubPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/judges" element={<JudgesPage />} />
        <Route path="/venues" element={<VenuesPage />} />
        <Route path="/matches/:id" element={<MatchPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<div className="page">Сторінку не знайдено</div>} />
      </Routes>
    </Shell>
  );
}
