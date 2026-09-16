import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { ErrorBox, Toggle } from '../components/ui.jsx';

/**
 * Організація матчу: чекліст делегата.
 *
 * Шаблон чекліста — один рядок у таблиці `Variables` (id 2), пункти розділені
 * символом `₴`. Формат не наш, його читає ADMIN, тому лишаємо як є.
 *
 * Пункти матчу зіставляються з шаблоном ЗА НАЗВОЮ, а не за порядком: якщо
 * шаблон згодом змінять, уже заповнені пункти не зʼїдуть на сусідні рядки.
 * Пункт, якого в шаблоні вже немає, показуємо окремо — він лишився від
 * старішої версії чекліста, і ховати його означало б втратити зауваження.
 *
 * Фото прикріплюється до пункту, а не до матчу, тож заливка можлива лише
 * після того, як пункт збережений і має id.
 */
export default function MatchOrganization({ matchId }) {
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ['organization', matchId], queryFn: () => crm.get(`/matches/${matchId}/organization`) });
  const [чернетка, setЧернетка] = useState({});

  useEffect(() => {
    if (!org.data) return;
    const d = {};
    for (const i of org.data.items || []) d[i.title] = { remark: !!i.Remark, remark_text: i.Remark_text || '' };
    setЧернетка(d);
  }, [org.data]);

  const save = useMutation({
    mutationFn: (items) => crm.put(`/matches/${matchId}/organization`, { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization', matchId] }),
  });
  const upload = useMutation({
    mutationFn: ({ id, file }) => {
      const form = new FormData();
      form.append('image', file);
      return crm.upload(`/organization/${id}/photo`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization', matchId] }),
  });
  const delPhoto = useMutation({
    mutationFn: (pid) => crm.del(`/organization-photos/${pid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organization', matchId] }),
  });

  const рядки = useMemo(() => {
    const шаблон = String(org.data?.template || '')
      .split('₴')
      .map((s) => s.trim())
      .filter(Boolean);
    const збережені = new Map((org.data?.items || []).map((i) => [i.title, i]));
    const зшаблону = шаблон.map((title) => ({ title, збережений: збережені.get(title) }));
    const поза = (org.data?.items || []).filter((i) => !шаблон.includes(i.title)).map((i) => ({ title: i.title, збережений: i, застарілий: true }));
    return [...зшаблону, ...поза];
  }, [org.data]);

  const змінити = (title, поле, значення) =>
    setЧернетка((s) => ({ ...s, [title]: { ...(s[title] || { remark: false, remark_text: '' }), [поле]: значення } }));

  const зберегти = () => {
    const items = рядки
      .map(({ title, збережений }) => ({ title, ...(чернетка[title] || { remark: false, remark_text: '' }), збережений }))
      // Шлемо лише те, де щось є або вже було: інакше кожне збереження
      // створювало б 33 порожні рядки на матч.
      .filter((i) => i.remark || i.remark_text || i.збережений)
      .map(({ title, remark, remark_text }) => ({ title, remark, remark_text }));
    save.mutate(items);
  };

  if (org.isPending) return <div className="muted">Завантаження…</div>;

  const заповнено = рядки.filter((r) => чернетка[r.title]?.remark || чернетка[r.title]?.remark_text).length;

  return (
    <section>
      <div className="section-bar">
        <span className="muted">
          Чекліст делегата, {рядки.length} пунктів. Позначено зауважень: {заповнено}. Фото прикріплюється до пункту після
          збереження
        </span>
        <button className="btn primary" onClick={зберегти} disabled={save.isPending}>
          Зберегти чекліст
        </button>
      </div>
      <ErrorBox error={org.error || save.error || upload.error || delPhoto.error} />
      <table className="table">
        <thead>
          <tr>
            <th>Пункт</th>
            <th>Зауваження</th>
            <th>Текст зауваження</th>
            <th>Фото</th>
          </tr>
        </thead>
        <tbody>
          {рядки.map(({ title, збережений, застарілий }) => (
            <tr key={title}>
              <td>
                {title}
                {застарілий && <span className="badge warn">не з поточного чекліста</span>}
              </td>
              <td>
                <Toggle
                  checked={!!чернетка[title]?.remark}
                  onChange={(v) => змінити(title, 'remark', v)}
                  label=""
                />
              </td>
              <td>
                <input
                  value={чернетка[title]?.remark_text || ''}
                  onChange={(e) => змінити(title, 'remark_text', e.target.value)}
                  placeholder="—"
                />
              </td>
              <td>
                <div className="club-cell">
                  {(збережений?._photos || []).map((p) => (
                    <span key={p.id} className="photo-chip">
                      <a href={p.photo?.url} target="_blank" rel="noreferrer">
                        <img src={p.photo?.url} alt="" className="logo-sm" />
                      </a>
                      <button className="btn small danger ghost" onClick={() => delPhoto.mutate(p.id)}>
                        ×
                      </button>
                    </span>
                  ))}
                  {збережений ? (
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files?.[0] && upload.mutate({ id: збережений.id, file: e.target.files[0] })}
                    />
                  ) : (
                    <span className="muted small-text">спершу збережіть пункт</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
