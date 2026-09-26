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
      // Xano на невірний пароль відповідає «Invalid Credentials.» зі статусом 500, не 401
      const invalid = /invalid credentials/i.test(err.message || '') || err.status === 401 || err.status === 403;
      setError(invalid ? new Error('Невірний id або пароль') : err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      {/* Повне лого з жовтим написом — тому на темно-синьому тлі сторінки, а не на білій картці */}
      <img src="/logo-afu-full.webp" alt="Асоціація футзалу України" className="login-logo" />
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-title">Вхід у CRM</h1>
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
