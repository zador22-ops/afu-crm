// Генератор агрегатів статистики сайту (afu-crm#10). Спільні SQL і JS-помічники в
// одному місці; кожен ендпоінт — окремий .xs у site/. Запуск: node xano/gen/site-stats.mjs
import fs from 'node:fs';
const OUT = new URL('../site/', import.meta.url);

// Події турніру з гравцем і клубом. Серія пенальті (хв. 51) і події штабу (хв. ≥ 1000)
// відкидаються тут, щоб жоден агрегат не порахував їх як голи матчу (R24, #10 п.1).
const SQL_EVENTS = `
        SELECT s.match_id, s.types_of_match_events_id AS ev, s.types_of_cards_id AS card, s.types_of_goals_id AS goal,
               s.minute, t.player_id, t.teaminfo_id, p."Name" AS first_name, p.prizvushche AS last_name, p."Photo" AS photo
          FROM x1_11 s
          JOIN x1_1 m ON m.id = s.match_id
          JOIN x1_7 t ON t.id = s.team_id
          LEFT JOIN x1_6 p ON p.id = t.player_id
         WHERE m.leagues_id = ?
           AND COALESCE(s.minute, 0) < 1000
           AND NOT (COALESCE(s.minute, 0) = 51 AND s.types_of_match_events_id IN (1, 3))`;
const SQL_APPEAR = `
        SELECT DISTINCT z.match_id, t.player_id, t.teaminfo_id
          FROM x1_20 z
          JOIN x1_1 m ON m.id = z.match_id
          JOIN x1_7 t ON t.id = z.team_id
         WHERE m.leagues_id = ?`;
const JS_HELPERS = `
        const img = (i) => { if (typeof i === 'string') { try { i = JSON.parse(i); } catch (e) { i = null; } } return i && (i.url || i.path) ? { url: i.url || 'https://xdeg-kg7i-jjtu.f2.xano.io' + i.path, width: (i.meta && i.meta.width) || null, height: (i.meta && i.meta.height) || null } : null; };
        const T = Object.fromEntries(($var.clubs || []).map((c) => [c.id, c]));
        const club = (id) => (T[id] ? { id: T[id].id, name: T[id].TeamName, logo: img(T[id].TeamLogo) } : null);
        const player = (r) => ({ id: Number(r.player_id), first_name: r.first_name || null, last_name: r.last_name || null, photo: img(r.photo) });
        const key = (r) => r.player_id + ':' + r.teaminfo_id;
        const матчі = {};
        for (const a of $var.appear || []) (матчі[key(a)] ||= new Set()).add(a.match_id);
        const рядки = {};
        const рядок = (r) => (рядки[key(r)] ||= { player: player(r), club: club(r.teaminfo_id), matches: (матчі[key(r)] || new Set()).size });`;

const head = (route, comment, inputs) => `query "${route}" verb=GET {
  api_group = "site"

${comment.split('\n').map((l) => '  // ' + l).join('\n')}
  input {
    int league_id
${inputs || ''}  }

  stack {
    db.get Leagues {
      field_name = "id"
      field_value = $input.league_id
      output = ["id", "Relevance"]
    } as $lg
    precondition ($lg != null && $lg.Relevance != false) {
      error_type = "notfound"
      error = "Турнір не знайдено"
    }

    db.direct_query {
      sql = """${SQL_EVENTS}
        """
      response_type = "list"
      arg = $input.league_id
    } as $events

    db.direct_query {
      sql = """${SQL_APPEAR}
        """
      response_type = "list"
      arg = $input.league_id
    } as $appear

    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo"]
    } as $clubs
`;
const tail = (js) => `
    api.lambda {
      code = """${JS_HELPERS}
${js}
      """
      timeout = 20
    } as $out
  }

  response = $out
}
`;

fs.writeFileSync(new URL('leagues-id-scorers.get.xs', OUT), head('leagues/{league_id}/scorers',
`afu-crm#10 п.1. Бомбардири турніру: голи гравця за протоколом, без автоголів
і без голів серії пенальті (хв. 51). penalty_goals / double_penalty_goals — з них
скільки з пенальті й з дабл-пенальті. matches — у скількох матчах був у заявці.
Порядок: голи ↓, менше матчів ↑, прізвище.`) + tail(`
        for (const e of $var.events || []) {
          if (Number(e.ev) !== 1 || Number(e.goal) === 2) continue;
          const r = рядок(e);
          r.goals = (r.goals || 0) + 1;
          if (Number(e.goal) === 3) r.penalty_goals = (r.penalty_goals || 0) + 1;
          if (Number(e.goal) === 4) r.double_penalty_goals = (r.double_penalty_goals || 0) + 1;
        }
        return Object.values(рядки)
          .map((r) => ({ ...r, goals: r.goals || 0, penalty_goals: r.penalty_goals || 0, double_penalty_goals: r.double_penalty_goals || 0 }))
          .sort((a, b) => b.goals - a.goals || a.matches - b.matches || String(a.player.last_name).localeCompare(String(b.player.last_name), 'uk'));`));

fs.writeFileSync(new URL('leagues-id-cards.get.xs', OUT), head('leagues/{league_id}/cards',
`afu-crm#10 п.2. Картки гравців турніру. type=yellow — жовті; type=red — червоні
плюс жовто-червоні (друга жовта гравця в тому самому матчі). Без карток штабу.
Порядок: кількість ↓, менше матчів ↑.`, `    text type?=yellow filters=trim\n`) + tail(`
        const жовті = {};
        for (const e of $var.events || []) {
          if (Number(e.ev) !== 2) continue;
          if (Number(e.card) === 2) (жовті[key(e) + ':' + e.match_id] ||= { e, n: 0 }).n++;
          if (Number(e.card) === 1 && $input.type === 'red') { const r = рядок(e); r.count = (r.count || 0) + 1; }
        }
        for (const { e, n } of Object.values(жовті)) {
          if ($input.type === 'red' && n >= 2) { const r = рядок(e); r.count = (r.count || 0) + 1; }
          if ($input.type !== 'red') { const r = рядок(e); r.count = (r.count || 0) + n; }
        }
        return Object.values(рядки).filter((r) => r.count > 0).sort((a, b) => b.count - a.count || a.matches - b.matches || String(a.player.last_name).localeCompare(String(b.player.last_name), 'uk'));`));

fs.writeFileSync(new URL('leagues-id-penalties.get.xs', OUT), head('leagues/{league_id}/penalties',
`afu-crm#10 п.3. Пенальті гравців турніру без серії (хв. 51). type=penalty —
6-метровий (тип голу 3), type=double — дабл-пенальті (тип 4). scored — забиті
(подія «гол»), missed — незабиті (подія «незабитий пенальті»). Порядок: забиті ↓.`, `    text type?=penalty filters=trim\n`) + tail(`
        const тип = $input.type === 'double' ? 4 : 3;
        for (const e of $var.events || []) {
          if (Number(e.goal) !== тип) continue;
          if (Number(e.ev) === 1) { const r = рядок(e); r.scored = (r.scored || 0) + 1; }
          if (Number(e.ev) === 3) { const r = рядок(e); r.missed = (r.missed || 0) + 1; }
        }
        return Object.values(рядки).map((r) => ({ ...r, scored: r.scored || 0, missed: r.missed || 0 })).filter((r) => r.scored + r.missed > 0)
          .sort((a, b) => b.scored - a.scored || a.missed - b.missed || String(a.player.last_name).localeCompare(String(b.player.last_name), 'uk'));`));

// Статистика команд: рахунок матчу за протоколом (без серії). Матч без жодного
// гола в протоколі (технічний результат) — за Result із бази.
fs.writeFileSync(new URL('leagues-id-team-stats.get.xs', OUT), head('leagues/{league_id}/team-stats',
`afu-crm#10 п.4. Статистика команд турніру за зіграними матчами (статус «Зіграний»).
Рахунок — за протоколом без серії пенальті; матч без голів у протоколі — за
рахунком у базі (технічний результат). won/drawn/lost — за рахунком матчу; серія
окремо: shootout_won / shootout_lost. own_goals_for — автоголи суперників на
користь команди. Картки й п'яті фоли — гравців.`).replace('    db.query TeamInfo {', `    db.query Match {
      where = $db.Match.leagues_id == $input.league_id && $db.Match.match_status_id == 4
      return = {type: "list"}
      output = ["id", "team1_id", "team2_id", "Result_team1", "Result_team2"]
    } as $matches

    db.direct_query {
      sql = """
        SELECT s.match_id, t.teaminfo_id, COUNT(*) AS n
          FROM x1_11 s JOIN x1_1 m ON m.id = s.match_id JOIN x1_7 t ON t.id = s.team_id
         WHERE m.leagues_id = ? AND s.minute = 51 AND s.types_of_match_events_id = 1
         GROUP BY s.match_id, t.teaminfo_id
        """
      response_type = "list"
      arg = $input.league_id
    } as $shootout

    db.query TeamInfo {`) + tail(`
        const ст = {};
        const st = (id) => (ст[id] ||= { club: club(id), played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, penalty_goals: 0, own_goals_for: 0, yellow_cards: 0, red_cards: 0, fifth_fouls: 0, shootout_won: 0, shootout_lost: 0 });
        const М = Object.fromEntries(($var.matches || []).map((m) => [m.id, m]));
        const голи = {};
        for (const e of $var.events || []) {
          const m = М[e.match_id];
          if (Number(e.ev) === 1 && m) {
            const свої = Number(e.teaminfo_id), чужі = свої === m.team1_id ? m.team2_id : m.team1_id;
            const кому = Number(e.goal) === 2 ? чужі : свої;
            (голи[m.id] ||= {})[кому] = ((голи[m.id] || {})[кому] || 0) + 1;
            if (Number(e.goal) === 2) st(чужі).own_goals_for++;
            if (Number(e.goal) === 3 || Number(e.goal) === 4) st(свої).penalty_goals++;
          }
          if (!m) continue;
          if (Number(e.ev) === 2 && Number(e.card) === 2) st(e.teaminfo_id).yellow_cards++;
          if (Number(e.ev) === 2 && Number(e.card) === 1) st(e.teaminfo_id).red_cards++;
          if (Number(e.ev) === 4) st(e.teaminfo_id).fifth_fouls++;
        }
        const серія = {};
        for (const s of $var.shootout || []) (серія[s.match_id] ||= {})[s.teaminfo_id] = Number(s.n);
        for (const m of $var.matches || []) {
          const g = голи[m.id];
          const a = g ? g[m.team1_id] || 0 : Number(m.Result_team1) || 0;
          const b = g ? g[m.team2_id] || 0 : Number(m.Result_team2) || 0;
          for (const [id, за, проти] of [[m.team1_id, a, b], [m.team2_id, b, a]]) {
            const r = st(id);
            r.played++; r.goals_for += за; r.goals_against += проти;
            if (за > проти) r.won++; else if (за < проти) r.lost++; else r.drawn++;
          }
          const s = серія[m.id];
          if (s && a === b) {
            const p1 = s[m.team1_id] || 0, p2 = s[m.team2_id] || 0;
            if (p1 !== p2) { st(p1 > p2 ? m.team1_id : m.team2_id).shootout_won++; st(p1 > p2 ? m.team2_id : m.team1_id).shootout_lost++; }
          }
        }
        return Object.values(ст).filter((r) => r.club).sort((a, b) => b.won - a.won || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against) || b.goals_for - a.goals_for);`));
console.log('згенеровано 4 ендпоінти');
