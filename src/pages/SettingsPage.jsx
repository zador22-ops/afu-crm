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

// R57: як кожен застосунок читає мінімальну версію — коротко, бо «правильна»
// цифра в чужому сенсі замикає людей (Андрій, 04.10)
const ЯК_ЧИТАЄ = {
  3: 'Старий ADMIN — лише точний збіг; ADMIN 2.0 — не нижче',
  5: 'Старий ADMIN — лише точний збіг; ADMIN 2.0 — не нижче',
  6: 'Нижчі версії побачать екран оновлення',
  7: 'iPhone до збірки 1.56 шле 1.27 — з примусом не вище 1.27',
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

          <AppVersions variables={list.data} />
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

// R57. Версії застосунків — одна таблиця, рядок на застосунок.
// «У магазині» — журнал релізів (вносить продакт після релізу): смуга «Є
// оновлення» і пуш, нікого не блокує. «Мінімальна» + примус — Variables
// 3/5/6/7: глухий екран для старіших збірок.
function AppVersions({ variables }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['releases'], queryFn: () => crm.get('/releases') });
  const [новий, setНовий] = useState(null);
  const [правка, setПравка] = useState(null);
  const [історія, setІсторія] = useState(false);
  const всі = list.data || [];
  const done = () => qc.invalidateQueries({ queryKey: ['releases'] });

  return (
    <section className="card-form">
      <h3>Версії застосунків</h3>
      <p className="muted small-text">
        <b>У магазині</b> — вносьте після релізу: застосунок покаже «Є оновлення», нікого не блокує. <b>Мінімальна</b> з
        примусом — старіші збірки не пустить.
      </p>
      <ErrorBox error={list.error} />
      <table className="table versions">
        <thead>
          <tr>
            <th>Застосунок</th>
            <th>У магазині</th>
            <th>Мінімальна</th>
          </tr>
        </thead>
        <tbody>
          {ЗАСТОСУНКИ.map((a) => {
            const r = всі.find((x) => x.app === a.app && x.platform === a.platform) || null;
            const row = (variables || []).find((v) => v.id === МАГАЗИН[`${a.app}:${a.platform}`]);
            return (
              <tr key={a.label}>
                <td className="strong nowrap">{a.label}</td>
                <td>
                  <div className="ver-cell">
                    {r ? (
                      <button type="button" className="link-button" onClick={() => setПравка(r)} title="Змінити «що нового», дату, посилання">
                        <span className="strong">{r.version}</span> <span className="muted small-text">{fmtDate(r.released_at)}</span>
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    <button className="btn small" onClick={() => setНовий({ ...a, store_url: r?.store_url || row?.explanatio || '' })}>
                      + реліз
                    </button>
                  </div>
                  {r?.note && <div className="muted small-text">{r.note}</div>}
                </td>
                <td>{row && <MinVersion item={row} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn small" onClick={() => setІсторія(!історія)} aria-expanded={історія}>
        {історія ? 'Сховати історію' : `Історія релізів (${всі.length})`}
      </button>
      {історія &&
        (всі.length === 0 ? (
          <Empty>Релізів ще не внесено</Empty>
        ) : (
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

function MinVersion({ item }) {
  const save = useSave(item.id);
  const [v, setV] = useState({ text: item.text || '', bool: !!item.bool });
  useEffect(() => setV({ text: item.text || '', bool: !!item.bool }), [item]);
  const змінено = v.text !== (item.text || '') || v.bool !== !!item.bool;
  // Попередження для iOS-фанатського (див. ЯК_ЧИТАЄ[7]). Не забороняє: рішення за
  // продактом (Андрій 04.10: «це моє рішення»)
  const небезпечно = item.id === 7 && v.bool && більша(v.text, '1.27');
  return (
    <form
      className="ver-cell"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(v);
      }}
    >
      <input className="ver-input" value={v.text} onChange={(e) => setV((s) => ({ ...s, text: e.target.value }))} aria-label="Мінімальна версія" />
      <label className="ver-force" title="Вимагати оновлення примусово">
        <input type="checkbox" checked={v.bool} onChange={(e) => setV((s) => ({ ...s, bool: e.target.checked }))} /> примус
      </label>
      {змінено && (
        <button className="btn small primary" disabled={save.isPending}>
          Зберегти
        </button>
      )}
      {save.isSuccess && !змінено && <span className="muted small-text">збережено</span>}
      <div className={небезпечно ? 'error-text ver-hint' : 'muted small-text ver-hint'}>
        {небезпечно ? 'Увага: iPhone до збірки 1.56 шле 1.27 і побачить екран оновлення' : ЯК_ЧИТАЄ[item.id]}
      </div>
      <ErrorBox error={save.error} />
    </form>
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
