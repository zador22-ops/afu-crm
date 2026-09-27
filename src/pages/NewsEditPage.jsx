import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { ErrorBox, Field, PageHeader, Toggle } from '../components/ui.jsx';
import NewsEditor from '../components/NewsEditor.jsx';
import { cleanNewsHtml } from '../utils/cleanHtml.js';
import { makeSlug, slugValid } from '../utils/slug.js';
import { makeThumb } from '../utils/thumb.js';
import { fromKyivInputValue, kyivDateTimeString, toKyivInputValue } from '../utils/kyivTime.js';
import { стан } from '../utils/newsStatus.js';

// Форма новини. Нова зберігається як чернетка; «Опублікувати» спершу зберігає
// зміни, потім викликає /publish, де сервер перевіряє обов'язкові поля.
// Обкладинку для нової новини вантажимо одразу після першого збереження:
// файл прив'язується до вже наявного запису.

const ПОРОЖНЯ = {
  title: '',
  slug: '',
  category_id: '',
  lead: '',
  body_html: '',
  cover_alt: '',
  gallery: [],
  video_url: '',
  tournament_ids: [],
  club_ids: [],
  match_id: '',
  is_featured: false,
  published_at: '',
};

const доФорми = (n) => ({
  title: n.title || '',
  slug: n.slug || '',
  category_id: n.category_id || '',
  lead: n.lead || '',
  body_html: n.body_html || '',
  cover_alt: n.cover_alt || '',
  gallery: Array.isArray(n.gallery) ? n.gallery : [],
  video_url: n.video_url || '',
  tournament_ids: n.tournament_ids || [],
  club_ids: n.club_ids || [],
  match_id: n.match_id || '',
  is_featured: Boolean(n.is_featured),
  published_at: n.published_at ? toKyivInputValue(n.published_at) : '',
});

const доСервера = (v) => ({
  title: v.title.trim(),
  slug: v.slug.trim(),
  category_id: v.category_id ? Number(v.category_id) : null,
  lead: v.lead.trim(),
  body_html: cleanNewsHtml(v.body_html),
  cover_alt: v.cover_alt.trim(),
  gallery: v.gallery,
  video_url: v.video_url.trim(),
  tournament_ids: v.tournament_ids,
  club_ids: v.club_ids,
  match_id: v.match_id ? Number(v.match_id) : null,
  is_featured: v.is_featured,
  published_at: v.published_at ? fromKyivInputValue(v.published_at) : null,
});

export default function NewsEditPage() {
  const { id } = useParams();
  const нова = id === 'new';
  const nid = нова ? null : Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();

  const item = useQuery({ queryKey: ['news-item', nid], queryFn: () => crm.get(`/news/${nid}`), enabled: !нова });
  const cats = useQuery({ queryKey: ['news-categories'], queryFn: () => crm.get('/news-categories') });
  const tournaments = useQuery({ queryKey: ['tournaments', 'all'], queryFn: () => crm.get('/tournaments') });
  const clubs = useQuery({ queryKey: ['clubs', false], queryFn: () => crm.get('/clubs') });

  const [v, setV] = useState(ПОРОЖНЯ);
  const [slugРучний, setSlugРучний] = useState(false);
  const [cover, setCover] = useState(null); // файл, ще не завантажений
  const [coverПрев, setCoverПрев] = useState(null);
  const [повідомлення, setПовідомлення] = useState('');

  useEffect(() => {
    if (item.data) {
      setV(доФорми(item.data));
      setSlugРучний(true);
    }
  }, [item.data]);

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const setTitle = (e) => {
    const title = e.target.value;
    setV((s) => ({ ...s, title, slug: slugРучний ? s.slug : makeSlug(title) }));
  };

  // Матч вибираємо з першого вибраного турніру — інакше список на сотні рядків
  const турнірМатчів = v.tournament_ids[0] || null;
  const matches = useQuery({
    queryKey: ['matches', турнірМатчів, ''],
    queryFn: () => crm.get('/matches', { leagues_id: турнірМатчів }),
    enabled: !!турнірМатчів,
  });

  const оновити = (saved) => {
    qc.invalidateQueries({ queryKey: ['news'] });
    qc.setQueryData(['news-item', saved.id], (old) => ({ ...(old || {}), ...saved }));
    qc.invalidateQueries({ queryKey: ['news-item', saved.id] });
  };

  const зберегти = async () => {
    const body = доСервера(v);
    let saved = нова ? await crm.post('/news', body) : await crm.patch(`/news/${nid}`, body);
    if (cover) {
      const form = new FormData();
      form.append('image', cover);
      form.append('thumb', await makeThumb(cover));
      saved = await crm.upload(`/news/${saved.id}/cover`, form);
      setCover(null);
    }
    return saved;
  };

  const save = useMutation({
    mutationFn: зберегти,
    onSuccess: (saved) => {
      оновити(saved);
      setПовідомлення('Збережено');
      if (нова) nav(`/news/${saved.id}`, { replace: true });
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      const saved = await зберегти();
      return crm.post(`/news/${saved.id}/publish`, v.published_at ? { published_at: fromKyivInputValue(v.published_at) } : {});
    },
    onSuccess: (saved) => {
      оновити(saved);
      setПовідомлення(Number(saved.published_at) > Date.now() ? `Відкладена публікація: ${kyivDateTimeString(saved.published_at)}` : 'Опубліковано');
      if (нова) nav(`/news/${saved.id}`, { replace: true });
    },
  });
  const setStatus = useMutation({
    mutationFn: (status) => crm.patch(`/news/${nid}`, { status }),
    onSuccess: (saved) => {
      оновити(saved);
      setПовідомлення(saved.status === 'archived' ? 'Перенесено в архів' : 'Знято з публікації — тепер це чернетка');
    },
  });
  const remove = useMutation({
    mutationFn: () => crm.del(`/news/${nid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['news'] });
      nav('/news');
    },
  });

  const n = item.data;
  const s = n ? стан(n) : { key: 'draft', label: 'нова' };
  const зайнято = save.isPending || publish.isPending || setStatus.isPending || remove.isPending;
  const помилка = save.error || publish.error || setStatus.error || remove.error;
  const чиннаОбкладинка = n?.cover?.url || null;

  const галерея = async (file) => {
    const form = new FormData();
    form.append('image', file);
    const img = await crm.upload('/news/images', form);
    setV((st) => ({ ...st, gallery: [...st.gallery, { image: img, alt: '', caption: '' }] }));
  };

  const турніриЗа = useMemo(() => {
    const t = [...(tournaments.data || [])];
    // Свіжі сезони першими
    t.sort((a, b) => (b.season_id || 0) - (a.season_id || 0) || a.id - b.id);
    return t;
  }, [tournaments.data]);

  const перемкнути = (key, id) =>
    setV((st) => ({ ...st, [key]: st[key].includes(id) ? st[key].filter((x) => x !== id) : [...st[key], id] }));

  if (!нова && item.isPending) return <div className="center muted">Завантаження…</div>;
  if (!нова && item.error) return <div className="page"><ErrorBox error={item.error} /></div>;

  return (
    <div className="page">
      <PageHeader
        back={
          <Link to="/news" className="back">
            ← Новини
          </Link>
        }
        title={нова ? 'Нова новина' : v.title || 'Новина'}
        subtitle={
          <>
            <span className={`badge news-${s.key}`}>{s.label}</span>
            {n?.published_at && <span className="muted"> · дата публікації {kyivDateTimeString(n.published_at)}</span>}
            {n?.updated_at && <span className="muted"> · змінено {kyivDateTimeString(n.updated_at)}</span>}
          </>
        }
      />

      <form
        className="form news-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Заголовок">
          <input value={v.title} onChange={setTitle} required autoFocus={нова} />
        </Field>
        <div className="row2">
          <Field label="Адреса на сайті" hint={`futsal.com.ua/novyny/${v.slug || '…'}/ — лише малі латинські літери, цифри й дефіси`}>
            <div className="club-cell">
              <input
                value={v.slug}
                onChange={(e) => {
                  setSlugРучний(true);
                  setV((st) => ({ ...st, slug: e.target.value.toLowerCase() }));
                }}
                required
              />
              <button
                type="button"
                className="btn small"
                title="Згенерувати з заголовка"
                onClick={() => {
                  setSlugРучний(false);
                  setV((st) => ({ ...st, slug: makeSlug(st.title) }));
                }}
              >
                З заголовка
              </button>
            </div>
            {v.slug && !slugValid(v.slug) && <div className="error-text">Лише малі латинські літери, цифри й дефіси між ними</div>}
          </Field>
          <Field label="Рубрика">
            <select value={v.category_id} onChange={set('category_id')}>
              <option value="">— виберіть —</option>
              {(cats.data || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_active ? '' : ' (прихована)'}
                </option>
              ))}
            </select>
            {cats.data?.length === 0 && (
              <div className="muted small-text">
                Рубрик ще немає — <Link to="/news-categories">створіть першу</Link>
              </div>
            )}
          </Field>
        </div>
        <Field label="Анонс" hint="1–2 речення для карток на сайті">
          <textarea rows={2} value={v.lead} onChange={set('lead')} />
        </Field>

        <Field label="Обкладинка" hint="Мініатюру до 400 px для списків CRM зробить сама">
          <div className="club-cell">
            {(coverПрев || чиннаОбкладинка) && <img src={coverПрев || чиннаОбкладинка} alt="" className="news-cover-prev" />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setCover(f);
                setCoverПрев(f ? URL.createObjectURL(f) : null);
              }}
            />
          </div>
        </Field>
        <Field label="Опис обкладинки" hint="Що зображено — для людей з вадами зору. Обов'язковий, якщо є обкладинка">
          <input value={v.cover_alt} onChange={set('cover_alt')} />
        </Field>

        <Field label="Текст новини">
          <NewsEditor value={v.body_html} onChange={(html) => setV((st) => ({ ...st, body_html: html }))} disabled={зайнято} />
        </Field>

        <Field label="Фотогалерея" hint="Необов'язкова. Кожне фото — з описом для людей з вадами зору">
          <div className="news-gallery">
            {v.gallery.map((g, i) => (
              <div key={i} className="news-gallery-item">
                {g.image?.url && <img src={g.image.url} alt="" />}
                <input
                  placeholder="Опис фото"
                  value={g.alt || ''}
                  onChange={(e) => setV((st) => ({ ...st, gallery: st.gallery.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) }))}
                />
                <input
                  placeholder="Підпис (необов'язково)"
                  value={g.caption || ''}
                  onChange={(e) => setV((st) => ({ ...st, gallery: st.gallery.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) }))}
                />
                <button type="button" className="btn small danger ghost" onClick={() => setV((st) => ({ ...st, gallery: st.gallery.filter((_, j) => j !== i) }))}>
                  Прибрати
                </button>
              </div>
            ))}
            <label className="btn small">
              Додати фото
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={async (e) => {
                  const files = [...(e.target.files || [])];
                  e.target.value = '';
                  for (const f of files) await галерея(f).catch((err) => window.alert(err.message || 'Фото не завантажилось'));
                }}
              />
            </label>
          </div>
        </Field>

        <Field label="Відео YouTube" hint="Необов'язкове посилання, покажеться під текстом">
          <input value={v.video_url} onChange={set('video_url')} placeholder="https://www.youtube.com/watch?v=…" />
        </Field>

        <Field label="Турніри" hint="Новина з'явиться на сторінках вибраних турнірів">
          <div className="pick-grid">
            {турніриЗа.map((t) => (
              <label key={t.id} className={`pick ${v.tournament_ids.includes(t.id) ? 'selected' : ''}`}>
                <input type="checkbox" checked={v.tournament_ids.includes(t.id)} onChange={() => перемкнути('tournament_ids', t.id)} />
                <span>{t.League}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Клуби" hint="Новина з'явиться на сторінках вибраних клубів">
          <div className="pick-grid">
            {(clubs.data || []).map((c) => (
              <label key={c.id} className={`pick ${v.club_ids.includes(c.id) ? 'selected' : ''}`}>
                <input type="checkbox" checked={v.club_ids.includes(c.id)} onChange={() => перемкнути('club_ids', c.id)} />
                {c.TeamLogo?.url && <img src={c.TeamLogo.url} alt="" className="logo-sm" />}
                <span>{c.TeamName}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field label="Звіт про матч" hint={турнірМатчів ? 'Матчі першого вибраного турніру' : 'Спершу виберіть турнір'}>
          <select value={v.match_id} onChange={set('match_id')} disabled={!турнірМатчів}>
            <option value="">— без матчу —</option>
            {(matches.data || []).map((m) => (
              <option key={m.id} value={m.id}>
                {kyivDateTimeString(m.TimeOfMatch)} · {m._team1?.TeamName} — {m._team2?.TeamName}
              </option>
            ))}
          </select>
        </Field>

        <div className="row2">
          <Field label="Дата публікації" hint="За Києвом. Порожньо — у момент «Опублікувати». Майбутня дата — відкладена публікація">
            <input type="datetime-local" value={v.published_at} onChange={set('published_at')} />
          </Field>
          <Field label=" ">
            <Toggle checked={v.is_featured} onChange={(x) => setV((st) => ({ ...st, is_featured: x }))} label="Закріпити на головній сайту" />
          </Field>
        </div>

        <ErrorBox error={помилка} />
        {повідомлення && !помилка && <div className="ok-text">{повідомлення}</div>}

        <div className="form-actions">
          {!нова && n?.status === 'draft' && (
            <button
              type="button"
              className="btn danger ghost"
              disabled={зайнято}
              onClick={() => window.confirm(`Видалити чернетку «${v.title}»? Це незворотно.`) && remove.mutate()}
            >
              Видалити чернетку
            </button>
          )}
          {!нова && n?.status === 'published' && (
            <>
              <button type="button" className="btn" disabled={зайнято} onClick={() => setStatus.mutate('draft')}>
                Зняти з публікації
              </button>
              <button type="button" className="btn" disabled={зайнято} onClick={() => setStatus.mutate('archived')}>
                В архів
              </button>
            </>
          )}
          {!нова && n?.status === 'archived' && (
            <button type="button" className="btn" disabled={зайнято} onClick={() => setStatus.mutate('draft')}>
              Повернути в чернетки
            </button>
          )}
          <span className="spacer" />
          <button className="btn" disabled={зайнято || !slugValid(v.slug)}>
            {n?.status === 'published' ? 'Зберегти зміни' : 'Зберегти чернетку'}
          </button>
          {n?.status !== 'published' && (
            <button type="button" className="btn primary" disabled={зайнято || !slugValid(v.slug)} onClick={() => publish.mutate()}>
              Опублікувати
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
