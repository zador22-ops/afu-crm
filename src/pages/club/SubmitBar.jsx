import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { club } from '../../api/client.js';
import { ErrorBox, Field, Modal } from '../../components/ui.jsx';
import { kyivDateTimeString } from '../../utils/kyivTime.js';
import { колиЗнову, підсумокЧернеток } from '../../utils/clubBatch.js';

/**
 * «Надіслати на погодження» (самообслуговування клубів, 2.2): усі чернетки
 * клубу одним пакетом; пакет на погодженні можна відкликати, поки АФУ не
 * ухвалила жодного рішення. Не частіше разу на годину (ТЗ 6).
 */
export default function SubmitBar({ teaminfoId }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [коментар, setКоментар] = useState('');
  const q = useQuery({ queryKey: ['club-pending', teaminfoId], queryFn: () => club.get(`/clubs/${teaminfoId}/pending`) });
  const оновити = () => {
    qc.invalidateQueries({ queryKey: ['club-pending', teaminfoId] });
    qc.invalidateQueries({ queryKey: ['club-draft', teaminfoId] });
    qc.invalidateQueries({ queryKey: ['club-requests', teaminfoId] });
  };
  const submit = useMutation({
    mutationFn: () => club.post(`/clubs/${teaminfoId}/submit`, { club_comment: коментар.trim() || undefined }),
    onSuccess: () => {
      setConfirm(false);
      setКоментар('');
      оновити();
    },
  });
  const withdraw = useMutation({
    mutationFn: (id) => club.post(`/clubs/${teaminfoId}/batches/${id}/withdraw`),
    onSuccess: оновити,
  });

  const д = q.data;
  if (!д) return <ErrorBox error={q.error} />;
  const підсумок = підсумокЧернеток(д.drafts);
  const пакет = д.open_batch;
  const знову = колиЗнову(д.next_submit_at);
  if (!підсумок && !пакет) return null;

  return (
    <div className="submit-bar">
      {пакет && (
        <div className="submit-row">
          <span>
            <strong>На погодженні АФУ</strong> · надіслано {kyivDateTimeString(пакет.submitted_at)}
            {пакет.decided > 0 && ` · рішень: ${пакет.decided} з ${пакет.rows}`}
          </span>
          {пакет.decided === 0 && (
            <button className="btn small" onClick={() => withdraw.mutate(пакет.id)} disabled={withdraw.isPending}>
              Відкликати
            </button>
          )}
        </div>
      )}
      {підсумок && (
        <div className="submit-row">
          <span>
            <strong>Не надіслано:</strong> {підсумок}
          </span>
          <button className="btn primary small" onClick={() => setConfirm(true)} disabled={!!знову}>
            Надіслати на погодження
          </button>
        </div>
      )}
      {підсумок && знову && <div className="muted small-text">Надсилати можна раз на годину — наступне о {знову}</div>}
      <ErrorBox error={withdraw.error} />
      {confirm && (
        <Modal title="Надіслати на погодження" onClose={() => setConfirm(false)}>
          <div className="form">
            <p>{підсумок}</p>
            <p className="muted small-text">
              Після надсилання змінювати ці записи не можна, доки АФУ не ухвалить рішення (або поки ви не відкличете пакет).
              На сайті й у застосунку зміни з'являться лише після погодження.
            </p>
            <Field label="Коментар для АФУ (необов'язково)">
              <textarea rows={3} value={коментар} onChange={(e) => setКоментар(e.target.value)} maxLength={1000} />
            </Field>
            <ErrorBox error={submit.error} />
            <div className="form-actions">
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => setConfirm(false)}>
                Скасувати
              </button>
              <button className="btn primary" onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? 'Надсилаємо…' : 'Надіслати'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
