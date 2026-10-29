import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClub } from '../../auth/ClubContext.jsx';
import { ErrorBox, Field } from '../../components/ui.jsx';

/**
 * Вхід представника клубу (самообслуговування клубів, 1.3) — окрема сторінка:
 * пошта й пароль від АФУ, не числовий id співробітника. Тексти помилок — як їх
 * повертає сервер («Неправильна пошта або пароль» тощо).
 */
export default function ClubLoginPage() {
  const { login, notice } = useClub();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      nav('/club', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <img src="/logo-afu-full.webp" alt="Асоціація футзалу України" className="login-logo" />
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-title">Кабінет клубу</h1>
        <p className="muted">Для представників клубів: пошта й пароль, які видала АФУ.</p>
        {notice && <div className="warn-box">{notice}</div>}
        <Field label="Пошта">
          <input type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Пароль">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorBox error={error} />
        <button className="btn primary wide" disabled={busy}>
          {busy ? 'Входимо…' : 'Увійти'}
        </button>
        <p className="muted small-text login-switch">
          Співробітник АФУ? <Link to="/login">Вхід у CRM</Link>
        </p>
      </form>
    </div>
  );
}
