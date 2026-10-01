import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, РОЛІ } from './auth/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SeasonsPage from './pages/SeasonsPage.jsx';
import SeasonPage from './pages/SeasonPage.jsx';
import TournamentPage from './pages/TournamentPage.jsx';
import CompetitionsPage from './pages/CompetitionsPage.jsx';
import ClubsPage from './pages/ClubsPage.jsx';
import ClubPage from './pages/ClubPage.jsx';
import OpponentsPage from './pages/OpponentsPage.jsx';
import PartnersPage from './pages/PartnersPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import GoverningBodiesPage from './pages/GoverningBodiesPage.jsx';
import FansPage from './pages/FansPage.jsx';
// Новини тягнуть редактор TipTap (~сотні КБ) — вантажимо лише коли відкрили
const NewsPage = lazy(() => import('./pages/NewsPage.jsx'));
const NewsEditPage = lazy(() => import('./pages/NewsEditPage.jsx'));
const NewsCategoriesPage = lazy(() => import('./pages/NewsCategoriesPage.jsx'));
import PeoplePage from './pages/PeoplePage.jsx';
import JudgesPage from './pages/JudgesPage.jsx';
import VenuesPage from './pages/VenuesPage.jsx';
import MatchPage from './pages/MatchPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import CalendarPage from './pages/CalendarPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const NAV = [
  { to: '/seasons', label: 'Сезони' },
  { to: '/calendar', label: 'Календар' },
  { to: '/news', label: 'Новини' },
  { to: '/partners', label: 'Партнери' },
  { to: '/documents', label: 'Документи' },
  { to: '/governing-bodies', label: 'Органи управління' },
  { to: '/competitions', label: 'Змагання' },
  { to: '/clubs', label: 'Клуби' },
  { to: '/opponents', label: 'Суперники' },
  { to: '/people', label: 'Особи' },
  { to: '/judges', label: 'Судді' },
  { to: '/venues', label: 'Арени' },
];

// Користувачі й службове — у верхній смузі поруч із профілем, як в Alliance CRM:
// це керування самою CRM, а не робота з даними федерації
const ІКОНКИ = {
  users: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  fans: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

const НАЛАШТУВАННЯ = [
  { to: '/users', label: 'Користувачі', icon: 'users' },
  { to: '/fans', label: 'Вболівальники', icon: 'fans' },
  { to: '/settings', label: 'Службове', icon: 'settings' },
];

// Одне меню «Налаштування»: закривається вибором пункту, кліком поза ним і Escape
function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const активне = НАЛАШТУВАННЯ.some((n) => location.pathname.startsWith(n.to));
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="topbar-menu" ref={ref}>
      <button
        type="button"
        className={`topbar-link${активне ? ' active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
      >
        {ІКОНКИ.settings}
        <span>Налаштування</span>
      </button>
      {open && (
        <div className="topbar-dropdown" role="menu">
          {НАЛАШТУВАННЯ.map((n) => (
            <NavLink key={n.to} to={n.to} role="menuitem" className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setOpen(false)}>
              {ІКОНКИ[n.icon]}
              <span>{n.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo-mark.png" alt="" className="brand-logo" />
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
      </aside>
      <div className="content">
        <header className="topbar">
          <SettingsMenu />
          <div className="topbar-user">
            <div className="topbar-user-text">
              <div className="user-name">{user?.Name || `Користувач ${user?.id ?? ''}`}</div>
              <div className="user-role">{РОЛІ[user?.types_of_user_roles_id] || 'роль не визначена'}</div>
            </div>
            <span className="topbar-avatar" aria-hidden="true">
              {String(user?.Name || '?').trim().charAt(0).toUpperCase()}
            </span>
            <button className="btn icon topbar-logout" onClick={logout} title="Вийти" aria-label="Вийти">
              {ІКОНКИ.logout}
            </button>
          </div>
        </header>
        <main>{children}</main>
      </div>
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
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/seasons/:id" element={<SeasonPage />} />
        <Route path="/tournaments/:id" element={<TournamentPage />} />
        <Route path="/competitions" element={<CompetitionsPage />} />
        <Route path="/clubs" element={<ClubsPage />} />
        <Route path="/clubs/:id" element={<ClubPage />} />
        <Route path="/opponents" element={<OpponentsPage />} />
        <Route path="/partners" element={<PartnersPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/governing-bodies" element={<GoverningBodiesPage />} />
        <Route path="/news" element={<Suspense fallback={<div className="center muted">Завантаження…</div>}><NewsPage /></Suspense>} />
        <Route path="/news/:id" element={<Suspense fallback={<div className="center muted">Завантаження…</div>}><NewsEditPage /></Suspense>} />
        <Route path="/news-categories" element={<Suspense fallback={<div className="center muted">Завантаження…</div>}><NewsCategoriesPage /></Suspense>} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/judges" element={<JudgesPage />} />
        <Route path="/venues" element={<VenuesPage />} />
        <Route path="/matches/:id" element={<MatchPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/fans" element={<FansPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<div className="page">Сторінку не знайдено</div>} />
      </Routes>
    </Shell>
  );
}
