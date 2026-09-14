import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorBox, Field } from '../components/ui.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(id, password);
      nav(loc.state?.from && loc.state.from !== '/login' ? loc.state.from : '/seasons', { replace: true });
    } catch (err) {
      setError(err.status === 403 || err.status === 401 ? new Error('Невірний id або пароль') : err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big">
          <span className="brand-mark">АФУ</span>
          <span className="brand-sub">CRM</span>
        </div>
        <p className="muted">Вхід той самий, що в ADMIN АФУ: числовий id користувача і пароль.</p>
        <Field label="ID користувача">
          <input inputMode="numeric" autoFocus value={id} onChange={(e) => setId(e.target.value)} required />
        </Field>
        <Field label="Пароль">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorBox error={error} />
        <button className="btn primary wide" disabled={busy}>
          {busy ? 'Входимо…' : 'Увійти'}
        </button>
      </form>
    </div>
  );
}
