import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { ErrorBox, Field, Modal, Toggle } from '../components/ui.jsx';
import { fromKyivInputValue, kyivDateTimeString, toKyivInputValue } from '../utils/kyivTime.js';

/**
 * «Службове → Заявкові періоди» (самообслуговування клубів, 3.4; право 21 —
 * сервер перевіряє сам). Для кожного турніру поточного сезону: прапорець «склад
 * лише в період» і самі періоди. Без прапорця клуб змінює склад будь-коли; з
 * ним — лише в період, а поза ним бачить дату наступного. АФУ змінює склад
 * будь-коли (рішення 8.3). Час — київський.
 */
export default function RegistrationWindows() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // {league, window?}
  const list = useQuery({ queryKey: ['registration-windows'], queryFn: () => crm.get('/registration-windows') });
  const оновити = () => qc.invalidateQueries({ queryKey: ['registration-windows'] });
  const rule = useMutation({
    mutationFn: ({ id, window_only }) => crm.put(`/registration-rules/${id}`, { window_only }),
    onSuccess: оновити,
  });

  return (
    <section className="card-form">
      <h3>Заявкові періоди</h3>
      <p className="muted small-text">
        Коли клуби можуть самі змінювати склад турніру. Без прапорця — будь-коли; з прапорцем — лише в період, поза ним
        кнопки в кабінеті клубу неактивні. АФУ змінює склад будь-коли
      </p>
      <ErrorBox error={list.error || rule.error} />
      {list.data?.length === 0 && <div className="muted">У поточному сезоні турнірів немає</div>}
      {(list.data || []).map((l) => (
        <div key={l.id} className="stage-block">
          <div className="section-bar">
            <h3>
              {l.name}
              <span className="muted small-text">
                {' '}
                · {l.open_now ? (l.window_only ? 'період триває' : 'склад відкритий') : l.next_window_at ? `наступний період з ${kyivDateTimeString(l.next_window_at)}` : 'період не призначено'}
              </span>
            </h3>
            <button className="btn small" onClick={() => setEditing({ league: l })}>
              Додати період
            </button>
          </div>
          <Toggle
            checked={l.window_only}
            onChange={(v) => rule.mutate({ id: l.id, window_only: v })}
            label={l.window_only ? 'склад — лише в період' : 'склад — будь-коли'}
          />
          {l.window_only && !l.windows.some((w) => w.ends_at > Date.now()) && (
            <div className="warn-box">Попереду періодів немає — клуби не зможуть змінювати склад цього турніру, доки ви не додасте період</div>
          )}
          {l.windows.length > 0 && (
            <table className="table compact">
              <tbody>
                {l.windows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      {kyivDateTimeString(w.starts_at)} — {kyivDateTimeString(w.ends_at)}
                    </td>
                    <td className="muted">{w.note || ''}</td>
                    <td className="row-actions">
                      <button className="btn small" onClick={() => setEditing({ league: l, window: w })}>
                        Змінити
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      {editing && (
        <WindowForm
          league={editing.league}
          item={editing.window}
          onClose={() => setEditing(null)}
          onDone={() => {
            оновити();
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function WindowForm({ league, item, onClose, onDone }) {
  const [поч, setПоч] = useState(item ? toKyivInputValue(item.starts_at) : '');
  const [кін, setКін] = useState(item ? toKyivInputValue(item.ends_at) : '');
  const [примітка, setПримітка] = useState(item?.note || '');
  const save = useMutation({
    mutationFn: () => {
      const body = { starts_at: fromKyivInputValue(поч), ends_at: fromKyivInputValue(кін), note: примітка.trim() };
      return item ? crm.patch(`/registration-windows/${item.id}`, body) : crm.post('/registration-windows', { ...body, leagues_id: league.id });
    },
    onSuccess: onDone,
  });
  const порядок = поч && кін && fromKyivInputValue(поч) >= fromKyivInputValue(кін);
  return (
    <Modal title={`${item ? 'Змінити період' : 'Новий період'}: ${league.name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="row2">
          <Field label="Початок (Київ)">
            <input type="datetime-local" value={поч} onChange={(e) => setПоч(e.target.value)} required />
          </Field>
          <Field label="Кінець (Київ)">
            <input type="datetime-local" value={кін} onChange={(e) => setКін(e.target.value)} required />
          </Field>
        </div>
        <Field label="Примітка" hint="Напр. «Дозаявка після першого кола»">
          <input value={примітка} onChange={(e) => setПримітка(e.target.value)} maxLength={200} />
        </Field>
        {порядок && <div className="error-box">Кінець періоду має бути пізніше за початок</div>}
        <ErrorBox error={save.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn primary" disabled={save.isPending || порядок}>
            {save.isPending ? 'Зберігаємо…' : 'Зберегти'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
