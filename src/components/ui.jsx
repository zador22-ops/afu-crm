import { useEffect, useState } from 'react';

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="page-header">
      <div>
        {back}
        <h1>{title}</h1>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Modal({ title, onClose, children, width = 520 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn icon" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/**
 * Аватар, який не показує зламану картинку.
 *
 * Потрібен через реальний стан бази: 99 суддів зі 104 посилаються на один
 * файл, якого у сховищі вже немає, і браузер малює на його місці значок
 * «биття». Порожній кружечок чесніший: фото справді немає.
 */
export function Avatar({ url, className = 'avatar', alt = '' }) {
  const [збій, setЗбій] = useState(false);
  if (!url || збій) return <span className={`${className} placeholder`} />;
  return <img src={url} alt={alt} className={className} onError={() => setЗбій(true)} />;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error-box">{error.message || String(error)}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={value === t.key ? 'tab active' : 'tab'} onClick={() => onChange(t.key)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// Проста форма: state-обʼєкт + set(name)(value)
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = (name) => (e) => {
    const v = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValues((s) => ({ ...s, [name]: v }));
  };
  return { values, set, setValues, reset: () => setValues(initial) };
}

export const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return y && m && day ? `${day}.${m}.${y}` : String(d);
};

export const today = () => new Date().toISOString().slice(0, 10);

export const dayBefore = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export const personName = (p) => [p?.prizvushche, p?.Name, p?.po_batkovi].filter(Boolean).join(' ');

export const toInt = (v) => (v === '' || v == null ? null : Number(v));
