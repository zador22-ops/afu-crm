import { Fragment } from 'react';
import { двоматчева, переможецьСерії } from '../utils/bracketLayout.js';
import { станПари } from '../utils/bracketView.js';

/**
 * Сітка плей-оф деревом — веб-копія AFU components/PlayoffBracket.js («варіант Б», слово Андрія 05.10):
 * раунди колонками з горизонтальною прокруткою, дужка з'єднує дві пари раунду з парою наступного,
 * «За 3 місце» — під фіналом. Геометрія — числами, як у застосунку: картка сталої висоти, слот раунду k
 * вищий за слот першого раунду в стільки разів, у скільки в ньому менше слотів.
 *
 * Відмінність від застосунку — лише для адміна (бриф crm-bracket-editor, п. 5): під командами рядок
 * стану матчів пари («матчу ще немає», «не зіграний», «зіграно 1 з 2»); порожній слот можна натиснути,
 * щоб створити пару в цьому раунді.
 *
 * Пропси: розкладка — результат розкластиСітку; onPair(пара, раунд); onEmpty(раундId).
 */

export const КАРТКА_ВИСОТА = 84;
export const КАРТКА_ШИРИНА = 196;
const ПРОМІЖОК = 12;
const ЗʼЄДНАННЯ = 24;
const ЛІНІЯ = 2;
const ЗАГОЛОВОК = 28;
const ЗА_ТРЕТЄ_ВІДСТУП = 28;
const СТАН = 16;
const РЯДОК = (КАРТКА_ВИСОТА - 2 - СТАН) / 2;

const число = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function Команда({ пара, сторона }) {
  const id = сторона === 1 ? пара.teaminfo_id1 : пара.teaminfo_id2;
  const інфо = сторона === 1 ? пара._teaminfo1 : пара._teaminfo2;
  const переможець = переможецьСерії(пара);
  const стан = переможець == null ? '' : переможець === id ? ' won' : ' lost';
  return (
    <div className={`bracket-team${стан}`} style={{ height: РЯДОК }}>
      {інфо?.TeamLogo?.url ? <img src={інфо.TeamLogo.url} alt="" className="bracket-logo" /> : <span className="bracket-logo logo-empty" />}
      <span className="bracket-name">{інфо?.TeamName || 'Команда'}</span>
      {двоматчева(пара) ? (
        [0, 1].map((і) => {
          const матч = пара.legs[і];
          const свій = матч?.score?.[сторона - 1];
          const серія = і === 1 ? матч?.penalty?.[сторона - 1] : null;
          return (
            <span key={і} className="bracket-score leg">
              {свій ?? '–'}
              {серія != null && <sup>{серія}</sup>}
            </span>
          );
        })
      ) : (
        <span className="bracket-score">{число(сторона === 1 ? пара.result_team1 : пара.result_team2) ?? '–'}</span>
      )}
    </div>
  );
}

function Слот({ пара, раунд, onPair, onEmpty }) {
  if (!пара) {
    return (
      <button type="button" className="bracket-card empty" style={{ height: КАРТКА_ВИСОТА, width: КАРТКА_ШИРИНА }} onClick={() => onEmpty?.(раунд.id)}>
        Пару ще не визначено
        {onEmpty && <span className="muted small-text">натисніть, щоб додати</span>}
      </button>
    );
  }
  const стан = станПари(пара);
  return (
    <button
      type="button"
      className="bracket-card"
      style={{ height: КАРТКА_ВИСОТА, width: КАРТКА_ШИРИНА }}
      onClick={() => onPair?.(пара, раунд)}
      aria-label={`${раунд.назва}: ${пара._teaminfo1?.TeamName || 'Команда'} — ${пара._teaminfo2?.TeamName || 'Команда'}`}
    >
      <Команда пара={пара} сторона={1} />
      <Команда пара={пара} сторона={2} />
      <span className="bracket-state" style={{ height: СТАН }}>
        {стан || 'зіграно'}
      </span>
    </button>
  );
}

function Дужки({ кількість, слот }) {
  return (
    <div className="bracket-links" style={{ paddingTop: ЗАГОЛОВОК, width: ЗʼЄДНАННЯ }}>
      {Array.from({ length: кількість }, (_, j) => (
        <div key={j} style={{ height: слот * 2, position: 'relative' }}>
          <div className="bracket-arc" style={{ height: слот + ЛІНІЯ, top: слот / 2 - ЛІНІЯ / 2, width: ЗʼЄДНАННЯ / 2, borderWidth: ЛІНІЯ }} />
          <div className="bracket-tick" style={{ height: ЛІНІЯ, left: ЗʼЄДНАННЯ / 2, top: слот - ЛІНІЯ / 2, width: ЗʼЄДНАННЯ / 2 }} />
        </div>
      ))}
    </div>
  );
}

export default function PlayoffBracket({ розкладка, onPair, onEmpty }) {
  const { колонки = [], заТретє = null } = розкладка || {};
  if (!колонки.length && !заТретє) return null;

  const першихСлотів = Math.max(1, колонки[0]?.пари.length ?? 1);
  const висотаДерева = (КАРТКА_ВИСОТА + ПРОМІЖОК) * першихСлотів;
  const слотРаунду = (к) => висотаДерева / колонки[к].пари.length;
  const верхЗаТретє = висотаДерева / 2 + КАРТКА_ВИСОТА / 2 + ЗА_ТРЕТЄ_ВІДСТУП;
  const висотаОстанньої = заТретє ? Math.max(висотаДерева, верхЗаТретє + ЗАГОЛОВОК + КАРТКА_ВИСОТА) : висотаДерева;

  return (
    <div className="bracket-scroll">
      <div className="bracket-tree">
        {колонки.map((колонка, к) => {
          const слот = слотРаунду(к);
          const остання = к === колонки.length - 1;
          return (
            <Fragment key={колонка.id ?? к}>
              <div className="bracket-round" style={{ width: КАРТКА_ШИРИНА }}>
                <div className="bracket-round-title" style={{ height: ЗАГОЛОВОК }}>
                  {колонка.назва}
                </div>
                <div style={{ height: остання ? висотаОстанньої : висотаДерева, position: 'relative' }}>
                  {колонка.пари.map((пара, j) => (
                    <div key={пара?.id ?? `порожній-${j}`} className="bracket-slot" style={{ height: слот, top: слот * j }}>
                      <Слот пара={пара} раунд={колонка} onPair={onPair} onEmpty={onEmpty} />
                    </div>
                  ))}
                  {остання && заТретє && (
                    <div style={{ left: 0, position: 'absolute', top: верхЗаТретє }}>
                      <div className="bracket-round-title" style={{ height: ЗАГОЛОВОК }}>
                        {заТретє.назва}
                      </div>
                      <Слот пара={заТретє.пара} раунд={{ id: заТретє.id, назва: заТретє.назва }} onPair={onPair} onEmpty={onEmpty} />
                    </div>
                  )}
                </div>
              </div>
              {!остання && <Дужки кількість={колонки[к + 1].пари.length} слот={слот} />}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
