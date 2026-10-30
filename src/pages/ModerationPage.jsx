import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { Empty, ErrorBox, Field, Modal, PageHeader, Tabs } from '../components/ui.jsx';
import { kyivDateTimeString } from '../utils/kyivTime.js';
import { СТАТУСИ, назваДії, порівняння } from '../utils/moderation.js';

const ТИПИ = [
  ['', 'Усі типи'],
  ['club', 'Картка клубу'],
  ['person', 'Дані осіб'],
  ['squad_row', 'Склад'],
  ['staff_row', 'Штаб'],
];

/**
 * «Погодження» (самообслуговування клубів, 4.1): пакети заявок клубів. Пакет →
 * рядки «було / стане»; «Погодити», «Повернути» з коментарем, «Погодити все в
 * пакеті». Погоджене одразу застосовується в основну базу (4.2).
 */
export default function ModerationPage() {
  const { id } = useParams();
  return id ? <BatchView id={Number(id)} /> : <BatchList />;
}

function BatchList() {
  const nav = useNavigate();
  const [стан, setСтан] = useState('open');
  const [клуб, setКлуб] = useState('');
  const [тип, setТип] = useState('');
  const list = useQuery({
    queryKey: ['moderation-batches', стан, клуб, тип],
    queryFn: () => crm.get('/moderation/batches', { state: стан, ...(клуб ? { teaminfo_id: клуб } : {}), ...(тип ? { entity: тип } : {}) }),
  });
  // Клуби для фільтра — з усіх пакетів (окремий запит без фільтрів)
  const усі = useQuery({ queryKey: ['moderation-batches', 'all', '', ''], queryFn: () => crm.get('/moderation/batches', { state: 'all' }) });
  const клуби = useMemo(() => {
    const м = new Map((усі.data || []).map((b) => [b.teaminfo_id, b.club_name]));
    return [...м].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'uk'));
  }, [усі.data]);

  return (
    <div className="page">
      <PageHeader title="Погодження" subtitle="Зміни, які надіслали клуби. Погоджене одразу потрапляє на сайт і в застосунок" />
      <Tabs
        value={стан}
        onChange={setСтан}
        tabs={[
          { key: 'open', label: 'Чекають рішення' },
          { key: 'done', label: 'Вирішені' },
          { key: 'withdrawn', label: 'Відкликані' },
          { key: 'all', label: 'Усі' },
        ]}
      />
      <div className="section-bar">
        <span className="club-cell">
          <select value={клуб} onChange={(e) => setКлуб(e.target.value)} aria-label="Клуб">
            <option value="">Усі клуби</option>
            {клуби.map(([id, назва]) => (
              <option key={id} value={id}>
                {назва || `клуб ${id}`}
              </option>
            ))}
          </select>
          <select value={тип} onChange={(e) => setТип(e.target.value)} aria-label="Тип змін">
            {ТИПИ.map(([k, назва]) => (
              <option key={k} value={k}>
                {назва}
              </option>
            ))}
          </select>
        </span>
      </div>
      <ErrorBox error={list.error} />
      {list.data?.length === 0 && <Empty>{стан === 'open' ? 'Нічого не чекає рішення' : 'Пакетів немає'}</Empty>}
      {list.data?.length > 0 && (
        <table className="table cards">
          <thead>
            <tr>
              <th>Клуб</th>
              <th>Пакет</th>
              <th>Надіслано</th>
              <th>Рядки</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((b) => (
              <tr key={b.id} className="clickable" onClick={() => nav(`/moderation/${b.id}`)}>
                <td className="strong">
                  <Link to={`/moderation/${b.id}`}>{b.club_name || `клуб ${b.teaminfo_id}`}</Link>
                </td>
                <td data-label="Пакет">
                  {b.title || <span className="muted">без назви</span>}
                  {b.acted_by_name && <div className="muted small-text">від імені АФУ: {b.acted_by_name}</div>}
                </td>
                <td data-label="Надіслано" className="muted">
                  {kyivDateTimeString(b.submitted_at)}
                </td>
                <td data-label="Рядки">
                  {b.counts.submitted > 0 && <span className="request-status wait">чекає {b.counts.submitted}</span>}
                  {b.counts.applied > 0 && <span className="request-status ok">застосовано {b.counts.applied}</span>}
                  {b.counts.rejected > 0 && <span className="request-status bad">повернуто {b.counts.rejected}</span>}
                  {b.counts.failed > 0 && <span className="request-status bad">не застосовано {b.counts.failed}</span>}
                  {b.state === 'withdrawn' && <span className="request-status muted">відкликано клубом</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BatchView({ id }) {
  const qc = useQueryClient();
  const [повернути, setПовернути] = useState(null);
  const q = useQuery({ queryKey: ['moderation-batch', id], queryFn: () => crm.get(`/moderation/batches/${id}`) });
  const оновити = () => {
    qc.invalidateQueries({ queryKey: ['moderation-batch', id] });
    qc.invalidateQueries({ queryKey: ['moderation-batches'] });
    qc.invalidateQueries({ queryKey: ['moderation-count'] });
  };
  const approve = useMutation({ mutationFn: (rid) => crm.post(`/moderation/requests/${rid}/approve`), onSettled: оновити });
  // «Погодити все» — по черзі за id (як подано): кожен рядок — своє застосування зі своїм CAS;
  // рядки нової особи після першого підуть у додаткові турніри. Один не пройшов — решта йдуть далі.
  const approveAll = useMutation({
    mutationFn: async () => {
      const ids = (q.data?.rows || []).filter((r) => r.decidable).map((r) => r.id).sort((a, b) => a - b);
      for (const rid of ids) {
        try {
          await crm.post(`/moderation/requests/${rid}/approve`);
        } catch (e) {
          // «Заявка вже змінилась» — хтось вирішив раніше; інше покаже картка рядка після оновлення
          if (!/змінилась/.test(e.message || '')) throw e;
        }
      }
    },
    onSettled: оновити,
  });
  const д = q.data;
  const чекають = (д?.rows || []).filter((r) => r.decidable).length;
  const зайнято = approve.isPending || approveAll.isPending;

  return (
    <div className="page">
      <PageHeader
        title={д ? `${д.batch.club_name || 'Клуб'}${д.batch.title ? ` — ${д.batch.title}` : ''}` : 'Пакет'}
        subtitle={д ? `Надіслано ${kyivDateTimeString(д.batch.submitted_at)}${д.batch.acted_by_name ? ` · від імені АФУ: ${д.batch.acted_by_name}` : ''}` : ''}
        actions={
          <>
            <Link to="/moderation" className="btn">
              До списку
            </Link>
            {чекають > 1 && (
              <button className="btn primary" onClick={() => approveAll.mutate()} disabled={зайнято}>
                {approveAll.isPending ? 'Застосовуємо…' : `Погодити все в пакеті (${чекають})`}
              </button>
            )}
          </>
        }
      />
      <ErrorBox error={q.error || approve.error || approveAll.error} />
      {д?.batch.club_comment && <div className="draft-status draft">Коментар клубу: {д.batch.club_comment}</div>}
      {(д?.rows || []).map((r) => (
        <RowCard key={r.id} r={r} labels={д.labels} зайнято={зайнято} onApprove={() => approve.mutate(r.id)} onReject={() => setПовернути(r)} />
      ))}
      {повернути && <RejectDialog row={повернути} onClose={() => setПовернути(null)} onDone={оновити} />}
    </div>
  );
}

function RowCard({ r, labels, зайнято, onApprove, onReject }) {
  const с = СТАТУСИ[r.status] || { текст: r.status, тон: 'muted' };
  const поля = порівняння(r, labels);
  return (
    <section className="card-form moderation-row">
      <div className="section-bar">
        <h3>
          {назваДії(r)}
          {r.person_name && <span className="muted"> · {r.person_name}</span>}
          {r.league_name && <span className="muted"> · {r.league_name}</span>}
        </h3>
        <span className={`request-status ${с.тон}`}>{с.текст}</span>
      </div>
      {r.new_person && r.entity !== 'person' && <div className="muted small-text">Нова особа — створиться разом із першим погодженим рядком</div>}
      {r.entity === 'person' && r.action === 'create' && r.status === 'submitted' && (
        <div className="muted small-text">Окремо не вирішується: створиться з першим погодженим рядком складу чи штабу, повернеться — якщо повернуто всі</div>
      )}
      {r.transfer_from_name && <div className="warn-box">Перехід зі старого клубу: {r.transfer_from_name}. Чинна заявка там закриється</div>}
      {r.primary_change && (
        <div className="warn-box">
          Основний турнір гравця зміниться на «{r.primary_change.league_name}»{r.primary_change.Number ? ` (номер ${r.primary_change.Number})` : ''}: від нього
          залежить «заявка турніру» в статистиці
        </div>
      )}
      {r.target === 'team_league' && <div className="muted small-text">Додатковий турнір гравця (основний не змінюється)</div>}
      {r.window_open === false && r.decidable && <div className="warn-box">Заявкове вікно турніру зараз закрите — погодження відхилиться</div>}
      {r.club_comment && <div className="muted small-text">Коментар клубу: {r.club_comment}</div>}
      {поля.length > 0 && (
        <table className="table compact compare">
          <thead>
            <tr>
              <th></th>
              <th>Було</th>
              <th>Стане</th>
            </tr>
          </thead>
          <tbody>
            {поля.map((п) => (
              <tr key={п.key}>
                <td className="muted">{п.label}</td>
                <td>
                  <Значення п={п} v={п.before} />
                </td>
                <td className={п.before !== п.after ? 'strong' : ''}>
                  <Значення п={п} v={п.after} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.decision_comment && (
        <div className="muted small-text">
          Рішення{r.decision_name ? ` (${r.decision_name})` : ''}: {r.decision_comment}
        </div>
      )}
      {r.apply_error && <div className="error-box">{r.apply_error}</div>}
      {r.decidable && (
        <div className="form-actions">
          <span className="spacer" />
          <button className="btn danger ghost" onClick={onReject} disabled={зайнято}>
            Повернути
          </button>
          <button className="btn primary" onClick={onApprove} disabled={зайнято}>
            Погодити
          </button>
        </div>
      )}
    </section>
  );
}

function Значення({ п, v }) {
  if (v == null) return <span className="muted">—</span>;
  if (п.kind === 'image') return v.url ? <img src={v.url} alt="" className="moderation-photo" /> : <span className="muted">файл</span>;
  if (п.kind === 'color') return <span className="kit-swatch" style={{ background: v }} title={v} />;
  return <span className="pre-line">{v}</span>;
}

function RejectDialog({ row, onClose, onDone }) {
  const [коментар, setКоментар] = useState('');
  const m = useMutation({
    mutationFn: () => crm.post(`/moderation/requests/${row.id}/reject`, { comment: коментар.trim() }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal title={`Повернути: ${назваДії(row)}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Чому повертаєте" hint="Клуб побачить цей текст у своїх заявках">
          <textarea rows={4} value={коментар} onChange={(e) => setКоментар(e.target.value)} required minLength={3} maxLength={1000} autoFocus />
        </Field>
        <ErrorBox error={m.error} />
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn danger" disabled={m.isPending || коментар.trim().length < 3}>
            Повернути
          </button>
        </div>
      </form>
    </Modal>
  );
}
