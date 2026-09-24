import { useMutation, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';

// R3 «Топ-матч». Ставиться лише майбутньому запланованому чи перенесеному
// матчу, знімається завжди. Правило «один на київський день» перевіряє Xano
// (`PATCH /matches/{id}/top`) і повертає назву вже позначеного матчу —
// його й показуємо під галочкою.
export const можнаТоп = (m) =>
  (Number(m?.match_status_id) === 1 || Number(m?.match_status_id) === 2) && Number(m?.TimeOfMatch) > Date.now();

export default function TopMatchToggle({ match, compact = false }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (is_top) => crm.patch(`/matches/${match.id}/top`, { is_top }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['match', String(match.id)] });
      qc.invalidateQueries({ queryKey: ['match', match.id] });
    },
  });
  const увімкнено = Boolean(match.is_top);
  // Зняти можна завжди — щоб прибрати застарілу позначку з уже зіграного
  const доступно = увімкнено || можнаТоп(match);
  const підказка = доступно ? 'Топ-матч дня на Головній застосунку' : 'Лише для майбутнього запланованого або перенесеного матчу';

  return (
    <span className="top-toggle">
      <label title={підказка} className={доступно ? '' : 'muted'}>
        <input
          type="checkbox"
          checked={увімкнено}
          disabled={!доступно || toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />{' '}
        {compact ? 'Топ' : 'Топ-матч'}
      </label>
      {toggle.error && <span className="top-toggle-error">{toggle.error.message}</span>}
    </span>
  );
}
