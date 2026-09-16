import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { ErrorBox, Field, PageHeader, Toggle } from '../components/ui.jsx';

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

          <section className="card-form">
            <h3>Обовʼязкові версії застосунків</h3>
            <p className="muted small-text">
              Якщо перемикач увімкнено, застосунок вимагатиме оновлення до вказаної версії й не пустить далі
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
