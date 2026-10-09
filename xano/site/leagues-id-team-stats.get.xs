query "leagues/{league_id}/team-stats" verb=GET {
  api_group = "site"

  // afu-crm#10 п.4. Статистика команд турніру за зіграними матчами (статус «Зіграний»).
  // Рахунок — за протоколом без серії пенальті; матч без голів у протоколі — за
  // рахунком у базі (технічний результат). won/drawn/lost — за рахунком матчу; серія
  // окремо: shootout_won / shootout_lost. own_goals_for — автоголи суперників на
  // користь команди. Картки й п'яті фоли — гравців.
  input {
    int league_id
  }

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
      sql = """
        SELECT s.match_id, s.types_of_match_events_id AS ev, s.types_of_cards_id AS card, s.types_of_goals_id AS goal,
               s.minute, t.player_id, t.teaminfo_id, p."Name" AS first_name, p.prizvushche AS last_name, p."Photo" AS photo
          FROM x1_11 s
          JOIN x1_1 m ON m.id = s.match_id
          JOIN x1_7 t ON t.id = s.team_id
          LEFT JOIN x1_6 p ON p.id = t.player_id
         WHERE m.leagues_id = ?
           AND COALESCE(s.minute, 0) < 1000
           AND NOT (COALESCE(s.minute, 0) = 51 AND s.types_of_match_events_id IN (1, 3))
        """
      response_type = "list"
      arg = $input.league_id
    } as $events

    db.direct_query {
      sql = """
        SELECT DISTINCT z.match_id, t.player_id, t.teaminfo_id
          FROM x1_20 z
          JOIN x1_1 m ON m.id = z.match_id
          JOIN x1_7 t ON t.id = z.team_id
         WHERE m.leagues_id = ?
        """
      response_type = "list"
      arg = $input.league_id
    } as $appear

    db.query Match {
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

    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo"]
    } as $clubs

    api.lambda {
      code = """
        const img = (i) => { if (typeof i === 'string') { try { i = JSON.parse(i); } catch (e) { i = null; } } return i && (i.url || i.path) ? { url: i.url || 'https://xdeg-kg7i-jjtu.f2.xano.io' + i.path, width: (i.meta && i.meta.width) || null, height: (i.meta && i.meta.height) || null } : null; };
        const T = Object.fromEntries(($var.clubs || []).map((c) => [c.id, c]));
        const club = (id) => (T[id] ? { id: T[id].id, name: T[id].TeamName, logo: img(T[id].TeamLogo) } : null);
        const player = (r) => ({ id: Number(r.player_id), first_name: r.first_name || null, last_name: r.last_name || null, photo: img(r.photo) });
        const key = (r) => r.player_id + ':' + r.teaminfo_id;
        const матчі = {};
        for (const a of $var.appear || []) (матчі[key(a)] ||= new Set()).add(a.match_id);
        const рядки = {};
        const рядок = (r) => (рядки[key(r)] ||= { player: player(r), club: club(r.teaminfo_id), matches: (матчі[key(r)] || new Set()).size });

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
        return Object.values(ст).filter((r) => r.club).sort((a, b) => b.won - a.won || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against) || b.goals_for - a.goals_for);
      """
      timeout = 20
    } as $out
  }

  response = $out
}
