import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Toggle } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';

// R55. Тексти пушів застосунку «Футзал АФУ» — шаблони зі змінними, які
// підставляє сервер (функція «Push v2 render»). Тут же журнал відправлень.
// Підстановка в прев'ю — та сама, що на сервері: порожня змінна зникає разом
// із зайвими «, » і «·».

const ЗМІННІ = {
  home: 'господарі',
  away: 'гості',
  competition: 'змагання',
  tour: 'тур',
  score: 'рахунок',
  player: 'прізвище',
  team: 'команда',
  minute: 'хвилина',
  half: 'тайм',
  time: 'новий час',
  title: 'заголовок новини',
  lead: 'анонс новини',
  version: 'версія',
  store: 'магазин',
  note: 'що нового',
};

// Справжній матч 509 (Авалон — СкайАп, 03.10), остання новина і версія — для прев'ю
const ПРИКЛАД = {
  home: 'Авалон',
  away: 'СкайАп',
  competition: 'Екстра-ліга',
  tour: '6-й тур',
  score: '1:5',
  player: 'Ліфер',
  team: 'СкайАп',
  minute: '7′',
  half: '1-й тайм',
  time: 'сб, 3 жовтня, 17:00',
  title: 'Призначення офіційних осіб на 6-й тур',
  lead: 'Комітет арбітражу АФУ оприлюднив призначення на матчі 6-го туру Екстра-ліги',
  version: '1.56.0',
  store: 'Google Play',
  note: 'Матчі більше не закриваються під час онлайну.',
};

const РЕЖИМИ = { live: 'справжнім', test: 'тестовим', dry: 'перевірка', silent: 'зафіксовано без розсилки' };

export const заповнити = (шаблон, vars = ПРИКЛАД) =>
  String(шаблон || '')
    .replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])))
    .replace(/\(\s*\)/g, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*(?=·|$)/g, '')
    .replace(/·\s*(?=·|$)/g, '')
    .replace(/^\s*·\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

export default function PushPage() {
  const data = useQuery({ queryKey: ['push-templates'], queryFn: () => crm.get('/push-templates') });
  const [editing, setEditing] = useState(null);
  const d = data.data;

  return (
    <div className="page">
      <PageHeader title="Пуші" subtitle="Тексти сповіщень застосунку «Футзал АФУ» і журнал відправлень" />
      <ErrorBox error={data.error} />
      {d && (
        <div className={d.live ? 'warn-box' : 'muted-box'}>
          {d.live ? (
            <>
              <span className="strong">Живий режим.</span> Нові пуші йдуть справжнім уболівальникам за їхніми темами.
            </>
          ) : (
            <>
              <span className="strong">Тестовий режим.</span> Нові тексти йдуть лише на тестові телефони ({d.test_phones}). Уболівальники поки
              отримують старі тексти. Живий режим вмикається окремим рішенням.
            </>
          )}
        </div>
      )}
      {d && (
        <table className="table">
          <thead>
            <tr>
              <th>Пуш</th>
              <th>Як виглядає</th>
              <th>Стан</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {d.templates.map((t) => (
              <tr key={t.id} className={t.enabled ? '' : 'muted'}>
                <td>
                  <span className="strong">{t.label}</span>
                  <div className="muted small-text">{t.hint}</div>
                </td>
                <td>
                  <PushPreview title={заповнити(t.title_template)} body={заповнити(t.body_template)} />
                </td>
                <td>{t.enabled ? 'надсилається' : <span className="badge warn">вимкнено</span>}</td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setEditing(t)}>
                    Змінити
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="section-title">Журнал відправлень</h3>
      {d && d.log.length === 0 && <Empty>Ще нічого не надсилалось</Empty>}
      {d?.log.length > 0 && (
        <table className="table compact">
          <thead>
            <tr>
              <th>Коли</th>
              <th>Пуш</th>
              <th>Кому</th>
              <th>Текст</th>
            </tr>
          </thead>
          <tbody>
            {d.log.map((r) => (
              <tr key={r.id}>
                <td className="nowrap muted">{kyivDateTimeString(r.sent_at)}</td>
                <td>
                  {d.templates.find((t) => t.kind === r.kind)?.label || r.kind}
                  <div className="muted small-text">{r.ref}</div>
                </td>
                <td className="nowrap">
                  {r.recipients} <span className="muted small-text">{РЕЖИМИ[r.mode] || r.mode}</span>
                </td>
                <td>
                  <span className="strong">{r.title}</span>
                  <div className="muted small-text">{r.body}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <TemplateForm t={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PushPreview({ title, body }) {
  return (
    <div className="push-preview" aria-label="Прев'ю сповіщення">
      <div className="push-preview-icon" aria-hidden="true">
        АФУ
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="push-preview-title">{title || '—'}</div>
        <div className="push-preview-body">{body || '—'}</div>
      </div>
    </div>
  );
}

function TemplateForm({ t, onClose }) {
  const qc = useQueryClient();
  const [v, setV] = useState({ title_template: t.title_template || '', body_template: t.body_template || '', enabled: t.enabled !== false });
  const [поле, setПоле] = useState('body_template');
  const refs = { title_template: useRef(null), body_template: useRef(null) };
  const save = useMutation({
    mutationFn: () => crm.patch(`/push-templates/${t.id}`, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['push-templates'] });
      onClose();
    },
  });
  const вставити = (k) => {
    const el = refs[поле].current;
    const текст = v[поле];
    const a = el?.selectionStart ?? текст.length;
    const b = el?.selectionEnd ?? текст.length;
    const нове = текст.slice(0, a) + `{${k}}` + текст.slice(b);
    setV((s) => ({ ...s, [поле]: нове }));
    requestAnimationFrame(() => {
      el?.focus();
      const p = a + k.length + 2;
      el?.setSelectionRange(p, p);
    });
  };
  const невідомі = [v.title_template, v.body_template]
    .flatMap((s) => [...s.matchAll(/\{(\w*)\}/g)].map((m) => m[1]))
    .filter((k) => !(k in ЗМІННІ));

  return (
    <Modal title={t.label} onClose={onClose} width={640}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="muted small-text">{t.hint}</p>
        <Field label="Заголовок">
          <input
            ref={refs.title_template}
            value={v.title_template}
            onFocus={() => setПоле('title_template')}
            onChange={(e) => setV((s) => ({ ...s, title_template: e.target.value }))}
            maxLength={120}
            required
          />
        </Field>
        <Field label="Текст">
          <textarea
            ref={refs.body_template}
            rows={3}
            value={v.body_template}
            onFocus={() => setПоле('body_template')}
            onChange={(e) => setV((s) => ({ ...s, body_template: e.target.value }))}
            maxLength={300}
            required
          />
        </Field>
        <div>
          <div className="field-label">Змінні — клік вставляє в {поле === 'title_template' ? 'заголовок' : 'текст'}</div>
          <div className="chips">
            {Object.entries(ЗМІННІ).map(([k, опис]) => (
              <button type="button" key={k} className="chip" onClick={() => вставити(k)} title={`${опис}: ${ПРИКЛАД[k]}`}>
                {`{${k}}`} <span className="muted">{опис}</span>
              </button>
            ))}
          </div>
          <div className="muted small-text">Якщо змінної для цього пуша немає (у штабу немає хвилини), вона зникає разом із зайвою комою</div>
        </div>
        {невідомі.length > 0 && <div className="error-box">Невідома змінна {`{${невідомі[0]}}`} — сервер такий текст не прийме</div>}
        <div>
          <div className="field-label">Прев'ю на матчі Авалон — СкайАп</div>
          <PushPreview title={заповнити(v.title_template)} body={заповнити(v.body_template)} />
        </div>
        <Toggle checked={v.enabled} onChange={(x) => setV((s) => ({ ...s, enabled: x }))} label="Надсилати цей пуш" />
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={save.isPending || невідомі.length > 0}>
            Зберегти
          </button>
        </div>
      </form>
    </Modal>
  );
}
