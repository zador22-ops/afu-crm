import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle } from '../components/ui.jsx';

/**
 * Службові налаштування — таблиця `Variables`, сім рядків, які керують
 * застосунками ззовні. Раніше їх правили руками в Xano, а два з них уміє
 * ADMIN.
 *
 * ЩО ТУТ ВАЖЛИВО ЗНАТИ. Рядки 1 і 4 — це НЕ повідомлення, а вимикачі: вони
 * блокують вхід в адмінський і фанатський застосунки відповідно, а текст
 * поруч — те, що побачить людина замість входу. У `docs/admin-app.md` рядок 4
 * описаний як «одноразове повідомлення користувачам» — це помилка документа,
 * жива база каже інше (`explanatio` самого рядка). Саме тому вимикачі тут
 * стоять окремим блоком із попередженням, а не серед інших полів.
 *
 * Чекліст (рядок 2) зберігається одним рядком через «₴», але редагується
 * по пункту на рядок: писати роздільник руками — найкоротший шлях загубити
 * половину чекліста.
 */
const БЛОКУВАННЯ = { 1: 'адмінський застосунок (ADMIN АФУ)', 4: 'фанатський застосунок' };
const ВЕРСІЇ = { 3: 'ADMIN, Android', 5: 'ADMIN, iOS', 6: 'Фанатський, Android', 7: 'Фанатський, iOS' };

// R57: як саме кожен застосунок читає мінімальну версію. Це не однаково, і
// «правильна» цифра в чужому сенсі замикає людей (Андрій, 04.10).
const ЯК_ЧИТАЄ = {
  3: 'Старий ADMIN (1.5.x) вимагає ТОЧНОГО збігу з його збіркою, ADMIN 2.0 — не нижче за вказану. Примус із версією 2.0.0 закриє старий ADMIN і залишить 2.0',
  5: 'Старий ADMIN (1.5.x) вимагає ТОЧНОГО збігу з його збіркою, ADMIN 2.0 — не нижче за вказану. Примус із версією 2.0.0 закриє старий ADMIN і залишить 2.0',
  6: 'Пускає всі версії, не нижчі за вказану. Нижчі бачать екран «Потрібне оновлення»',
  7: 'Збірки iOS до 1.56 повідомляють не справжню версію, а 1.27. Поки вони в людей, з примусом тут не можна ставити вище 1.27 — заблокуються всі iPhone',
};
const МАГАЗИН = { 'fan:android': 6, 'fan:ios': 7, 'admin:android': 3, 'admin:ios': 5 };
const ЗАСТОСУНКИ = [
  { app: 'fan', platform: 'android', label: 'Фанатський, Android' },
  { app: 'fan', platform: 'ios', label: 'Фанатський, iOS' },
  { app: 'admin', platform: 'android', label: 'ADMIN, Android' },
  { app: 'admin', platform: 'ios', label: 'ADMIN, iOS' },
];
const чиста = (v) => String(v || '').trim().replace(/^[vV]\.?\s*/, '');
const більша = (a, b) => {
  const x = чиста(a).split('.').map(Number), y = чиста(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

export default function SettingsPage() {
  const list = useQuery({ queryKey: ['variables'], queryFn: () => crm.get('/variables') });
  const рядок = (id) => (list.data || []).find((v) => v.id === id);

  return (
    <div className="page">
      <PageHeader
        title="Службове"
        subtitle="Налаштування, які керують застосунками ззовні. Помилка тут видима одразу всім користувачам"
      />
      <ErrorBox error={list.error} />
      {list.data && (
        <>
          <section className="card-form">
            <h3>Чекліст організації матчу</h3>
            <Checklist item={рядок(2)} />
          </section>

          <section className="card-form">
            <h3>Блокування входу</h3>
            <p className="muted small-text">
              Вмикає заглушку замість входу. Текст побачать усі, хто спробує увійти. Це не повідомлення в застосунку — це
              зачинені двері
            </p>
            {[1, 4].map((id) => (
              <Blocker key={id} item={рядок(id)} назва={БЛОКУВАННЯ[id]} />
            ))}
          </section>

          <Releases variables={list.data} />

          <section className="card-form">
            <h3>Мінімальні версії застосунків</h3>
            <p className="muted small-text">
              Глухий екран «Потрібне оновлення» для збірок, які вже не працюють із сервером. Вмикається лише тоді, коли
              стара версія справді несумісна. Звичайне «вийшло оновлення» — у блоці вище, воно нікого не блокує
            </p>
            {[3, 5, 6, 7].map((id) => (
              <Version key={id} item={рядок(id)} назва={ВЕРСІЇ[id]} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function useSave(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => crm.patch(`/variables/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variables'] }),
  });
}

function Checklist({ item }) {
  const save = useSave(item?.id);
  const [текст, setТекст] = useState('');
  useEffect(() => {
    if (item) setТекст(String(item.text || '').split('₴').map((s) => s.trim()).filter(Boolean).join('\n'));
  }, [item]);
  const пунктів = текст.split('\n').filter((s) => s.trim()).length;
  if (!item) return null;
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ text: текст.split('\n').map((s) => s.trim()).filter(Boolean).join('₴') });
      }}
    >
      <Field label={`Пункти, по одному на рядок — зараз ${пунктів}`} hint="У базі вони зберігаються одним рядком через «₴»; тут роздільник додається сам">
        <textarea rows={12} value={текст} onChange={(e) => setТекст(e.target.value)} />
      </Field>
      <ErrorBox error={save.error} />
      <div className="form-actions">
        {save.isSuccess && <span className="muted small-text">збережено</span>}
        <button className="btn primary" disabled={save.isPending || пунктів === 0}>
          Зберегти чекліст
        </button>
      </div>
    </form>
  );
}

function Blocker({ item, назва }) {
  const save = useSave(item?.id);
  const [on, setOn] = useState(false);
  const [текст, setТекст] = useState('');
  useEffect(() => {
    if (item) {
      setOn(!!item.bool);
      setТекст(item.text || '');
    }
  }, [item]);
  if (!item) return null;
  return (
    <form
      className={on ? 'form danger-box' : 'form'}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ bool: on, text: текст });
      }}
    >
      <div className="row2">
        <Field label={назва}>
          <Toggle checked={on} onChange={setOn} label={on ? 'вхід заблоковано' : 'вхід відкритий'} />
        </Field>
        <Field label="Текст замість входу">
          <input value={текст} onChange={(e) => setТекст(e.target.value)} />
        </Field>
      </div>
      <ErrorBox error={save.error} />
      <div className="form-actions">
        {save.isSuccess && <span className="muted small-text">збережено</span>}
        <button className="btn primary" disabled={save.isPending}>
          Зберегти
        </button>
      </div>
    </form>
  );
}

function Version({ item, назва }) {
  const save = useSave(item?.id);
  const [values, setValues] = useState({ bool: false, text: '', explanatio: '' });
  useEffect(() => {
    if (item) setValues({ bool: !!item.bool, text: item.text || '', explanatio: item.explanatio || '' });
  }, [item]);
  if (!item) return null;
  // Запобіжник для iOS-фанатського: див. ЯК_ЧИТАЄ[7]
  const небезпечно = item.id === 7 && values.bool && більша(values.text, '1.27');
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(values);
      }}
    >
      <div className="row2">
        <Field label={назва}>
          <input value={values.text} onChange={(e) => setValues((s) => ({ ...s, text: e.target.value }))} />
        </Field>
        <Field label="Посилання на магазин">
          <input value={values.explanatio} onChange={(e) => setValues((s) => ({ ...s, explanatio: e.target.value }))} />
        </Field>
      </div>
      <Toggle
        checked={values.bool}
        onChange={(v) => setValues((s) => ({ ...s, bool: v }))}
        label="Вимагати оновлення примусово"
      />
      <div className="muted small-text">{ЯК_ЧИТАЄ[item.id]}</div>
      {небезпечно && <div className="error-box">З увімкненим примусом версія вище 1.27 заблокує всі iPhone. Залиште 1.27 або вимкніть примус</div>}
      <ErrorBox error={save.error} />
      <div className="form-actions">
        {save.isSuccess && <span className="muted small-text">збережено</span>}
        <button className="btn primary" disabled={save.isPending || небезпечно}>
          Зберегти
        </button>
      </div>
    </form>
  );
}

// R57. Актуальні версії в магазинах — журнал релізів. Вносить продакт, коли
// версія справді в магазині. Від цього залежать м'який банер «Є оновлення» в
// застосунках і пуш про нову версію (фанатський, лише major/minor).
function Releases({ variables }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['releases'], queryFn: () => crm.get('/releases') });
  const [новий, setНовий] = useState(null);
  const [правка, setПравка] = useState(null);
  const [історія, setІсторія] = useState(false);
  const всі = list.data || [];
  const останній = (a) => всі.find((r) => r.app === a.app && r.platform === a.platform) || null;
  const посилання = (a) => (variables || []).find((v) => v.id === МАГАЗИН[`${a.app}:${a.platform}`])?.explanatio || '';
  const done = () => qc.invalidateQueries({ queryKey: ['releases'] });

  return (
    <section className="card-form">
      <h3>Актуальні версії в магазинах</h3>
      <p className="muted small-text">
        Вносьте нову версію після релізу, коли перевірили, що вона справді в магазині. Застосунки покажуть смугу «Є
        оновлення», а вболівальники отримають пуш (лише на нову major/minor-версію). Нікого не блокує
      </p>
      <ErrorBox error={list.error} />
      <table className="table">
        <thead>
          <tr>
            <th>Застосунок</th>
            <th>Версія в магазині</th>
            <th>Що нового</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ЗАСТОСУНКИ.map((a) => {
            const r = останній(a);
            return (
              <tr key={a.label}>
                <td className="strong">{a.label}</td>
                <td>
                  {r ? (
                    <>
                      <span className="strong">{r.version}</span> <span className="muted small-text">від {fmtDate(r.released_at)}</span>
                    </>
                  ) : (
                    <span className="muted">не внесено</span>
                  )}
                </td>
                <td className="muted">{r?.note || '—'}</td>
                <td className="row-actions">
                  <button className="btn small primary" onClick={() => setНовий({ ...a, store_url: r?.store_url || посилання(a) })}>
                    Новий реліз
                  </button>
                  {r && (
                    <button className="btn small" onClick={() => setПравка(r)}>
                      Змінити
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn small" onClick={() => setІсторія(!історія)} aria-expanded={історія}>
        {історія ? 'Сховати історію' : `Історія релізів (${всі.length})`}
      </button>
      {історія && (всі.length === 0 ? <Empty>Релізів ще не внесено</Empty> : (
        <table className="table compact">
          <tbody>
            {всі.map((r) => (
              <tr key={r.id}>
                <td>{ЗАСТОСУНКИ.find((a) => a.app === r.app && a.platform === r.platform)?.label}</td>
                <td className="strong">{r.version}</td>
                <td className="muted">{fmtDate(r.released_at)}</td>
                <td className="muted">{r.note || '—'}</td>
                <td className="muted">{r._by?.Name || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {новий && <ReleaseForm init={новий} onClose={() => setНовий(null)} onDone={done} />}
      {правка && <ReleaseForm init={правка} edit onClose={() => setПравка(null)} onDone={done} />}
    </section>
  );
}

const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' }) : '');
const сьогодні = () => new Date().toISOString().slice(0, 10);

function ReleaseForm({ init, edit, onClose, onDone }) {
  const назва = ЗАСТОСУНКИ.find((a) => a.app === init.app && a.platform === init.platform)?.label;
  const [v, setV] = useState({
    version: edit ? init.version : '',
    note: init.note || '',
    store_url: init.store_url || '',
    released_at: init.released_at ? new Date(init.released_at).toISOString().slice(0, 10) : сьогодні(),
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { note: v.note.trim(), store_url: v.store_url.trim(), released_at: Date.parse(v.released_at + 'T12:00:00Z') };
      return edit ? crm.patch(`/releases/${init.id}`, body) : crm.post('/releases', { ...body, app: init.app, platform: init.platform, version: v.version.trim() });
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={edit ? `${назва}: ${init.version}` : `Новий реліз — ${назва}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {!edit && (
          <Field label="Версія" hint="Як у магазині: 1.56.0. Вносьте, коли перевірили, що вона вже там">
            <input value={v.version} onChange={(e) => setV((s) => ({ ...s, version: e.target.value }))} required autoFocus placeholder="1.56.0" />
          </Field>
        )}
        <Field label="Що нового" hint="Одне-два речення про користь — це текст смуги й пуша. Порожньо — загальний текст">
          <textarea rows={3} value={v.note} onChange={(e) => setV((s) => ({ ...s, note: e.target.value }))} maxLength={200} />
        </Field>
        <div className="row2">
          <Field label="Дата в магазині">
            <input type="date" value={v.released_at} onChange={(e) => setV((s) => ({ ...s, released_at: e.target.value }))} required />
          </Field>
          <Field label="Посилання на магазин">
            <input value={v.store_url} onChange={(e) => setV((s) => ({ ...s, store_url: e.target.value }))} placeholder="https://…" />
          </Field>
        </div>
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={save.isPending}>
            {edit ? 'Зберегти' : 'Внести реліз'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
