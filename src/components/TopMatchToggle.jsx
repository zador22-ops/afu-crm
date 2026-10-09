import { useMutation, useQueryClient } from '@tanstack/react-query';
import { crm } from '../api/client.js';

// R3 «Топ-матч», R60а (Андрій 09.10): реклама матчу на Головній застосунку.
// Ставиться будь-якій кількості матчів, чий київський день — сьогодні або
// пізніше; знімається завжди. Те саме правило перевіряє Xano (`PATCH /matches/{id}/top`).
const київськийДень = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Number(ms)));
export const можнаТоп = (m) => Number(m?.TimeOfMatch) > 0 && київськийДень(m.TimeOfMatch) >= київськийДень(Date.now());

export default function TopMatchToggle({ match, compact = false }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (is_top) => crm.patch(`/matches/${match.id}/top`, { is_top }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['top-list'] });
      qc.invalidateQueries({ queryKey: ['match', String(match.id)] });
      qc.invalidateQueries({ queryKey: ['match', match.id] });
    },
  });
  const увімкнено = Boolean(match.is_top);
  // Зняти можна завжди — щоб прибрати застарілу позначку з уже зіграного
  const доступно = увімкнено || можнаТоп(match);
  const підказка = доступно ? 'Топ-матч на Головній застосунку (їх може бути кілька)' : 'Лише для сьогоднішнього або майбутнього матчу';

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
