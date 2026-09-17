import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { crm } from '../api/client.js';
import { ErrorBox } from '../components/ui.jsx';
import { kyivDateDashString, kyivTimeString } from '../utils/kyivTime.js';

/**
 * Рапорт делегата — веброзклад того самого документа, що ADMIN збирає через
 * expo-print (`global-functions/RaportDelegataPDF.js`). Серверного ендпоінта
 * для рапорту немає ні там, ні тут: документ складається з трьох відповідей,
 * які вже завантажені, а PDF робить друк браузера.
 *
 * Порядок і формулювання навмисно ті самі, що в ADMIN: шапка з логотипом,
 * назва турніру великими, реквізити АФУ, рахунок між гербами, реквізити
 * матчу, повний чекліст рядками «пункт: ✅/❌», а далі — окремими блоками з
 * розривом сторінки ті пункти, де є коментар або фото. Делегат має отримувати
 * той самий документ незалежно від того, звідки його надрукували.
 */
const ЛОГО =
  'https://xdeg-kg7i-jjtu.f2.xano.io/vault/oRBbf5J7/W9pxiKVExXZSd0E4RCoUr7PJFwA/9v58og../%D0%90%D0%A4%D0%A3_Vertical_Full_Txt_RGB.png';

export default function MatchReport({ match }) {
  const org = useQuery({ queryKey: ['organization', match.id], queryFn: () => crm.get(`/matches/${match.id}/organization`) });
  const venues = useQuery({ queryKey: ['venues'], queryFn: () => crm.get('/venues') });
  const delegates = useQuery({ queryKey: ['delegates'], queryFn: () => crm.get('/delegates') });
  const tournaments = useQuery({ queryKey: ['tournaments', 'all'], queryFn: () => crm.get('/tournaments') });

  const арена = (venues.data || []).find((v) => v.id === match.venues_id)?.City || '—';
  const делегат = (delegates.data || []).find((d) => d.id === match.users_idDelegat)?.Name || '—';
  const турнір = (tournaments.data || []).find((t) => t.id === match.leagues_id);

  const { пункти, розширені } = useMemo(() => {
    const шаблон = String(org.data?.template || '')
      .split('₴')
      .map((s) => s.trim())
      .filter(Boolean);
    const збережені = new Map((org.data?.items || []).map((i) => [i.title, i]));
    // Пункт без збереженого рядка — це «немає зауважень», так само як в ADMIN
    const пункти = шаблон.map((title) => ({ title, remark: !!збережені.get(title)?.Remark }));
    const розширені = шаблон
      .map((title) => збережені.get(title))
      .filter((i) => i && (i.Remark_text || (i._photos || []).length));
    return { пункти, розширені };
  }, [org.data]);

  // Завжди за Києвом, незалежно від пристрою — знахідка 2026-09-17: тут
  // раніше стояв голий new Date().getHours(), який показував місцевий час
  // браузера. Див. src/utils/kyivTime.js.
  const дата = kyivDateDashString(match.TimeOfMatch);
  const час = kyivTimeString(match.TimeOfMatch);

  return (
    <section>
      <div className="section-bar no-print">
        <span className="muted">
          Той самий документ, що друкує ADMIN. Кнопка відкриває друк браузера — там оберіть «Зберегти як PDF»
        </span>
        <button className="btn primary" onClick={() => window.print()} disabled={org.isPending}>
          Друк / зберегти PDF
        </button>
      </div>
      <ErrorBox error={org.error} />
      <div className="report">
        <img src={ЛОГО} alt="" className="report-logo" />
        <h1>Рапорт делегата</h1>
        <h2>Асоціації футзалу України</h2>
        <h2 className="report-league">{(турнір?.League || '').toUpperCase()}</h2>
        <p className="report-contacts">
          email: comitetvakula@gmail.com
          <br />
          01133, Київ, пров. Лабораторний, 7А,
          <br />
          Будинок Футболу, кім. 202
        </p>

        <div className="report-score">
          {match._team1?.TeamLogo?.url && <img src={match._team1.TeamLogo.url} alt="" />}
          <span>
            {match.Result_team1 ?? 0} - {match.Result_team2 ?? 0}
          </span>
          {match._team2?.TeamLogo?.url && <img src={match._team2.TeamLogo.url} alt="" />}
        </div>

        <p>
          № Матчу <u>{match.match_number || '-//-'}</u>
        </p>
        <p>
          П.І.Б Делегат АФУ/місто: <u>{делегат}</u>.
        </p>
        <p>
          Дата матчу: <u>{дата}</u>.
        </p>
        <p>
          Назва споруди/місто: <u>{арена}</u>. Час початку матчу: <u>{час}</u>.
        </p>
        <p>
          Команда господарів: <u>{match._team1?.TeamName}</u>. Команда гостей: <u>{match._team2?.TeamName}</u>.
        </p>

        <p className="report-list">
          {пункти.map((п) => (
            <span key={п.title}>
              {п.title}: {п.remark ? '❌' : '✅'}
              <br />
            </span>
          ))}
        </p>

        {розширені.map((i) => (
          <div key={i.id} className="report-extra">
            <p>
              <b>{i.title}</b>
              {i.Remark_text ? ` (додатковий коментар): ${i.Remark_text}` : ''}
            </p>
            {(i._photos || []).map((p) => (
              <div key={p.id} className="report-photo">
                <img src={p.photo?.url} alt="" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
