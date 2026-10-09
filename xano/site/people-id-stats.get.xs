query "people/{person_id}/stats" verb=GET {
  api_group = "site"

  // afu-crm#10 п.5. Статистика гравця за протоколами: матчі (у заявці), голи (без
  // автоголів і без серії пенальті, хв. 51), автоголи, жовті, червоні (червона +
  // жовто-червона — друга жовта в тому самому матчі). total і by_league — по
  // турнірах, нові першими. Приховані турніри (Relevance = false) не рахуються.
  input {
    int person_id filters=min:1
  }

  stack {
    db.direct_query {
      sql = """
        SELECT s.match_id, m.leagues_id, s.types_of_match_events_id AS ev, s.types_of_cards_id AS card, s.types_of_goals_id AS goal
          FROM x1_11 s
          JOIN x1_7 t ON t.id = s.team_id
          JOIN x1_1 m ON m.id = s.match_id
         WHERE t.player_id = ?
           AND COALESCE(s.minute, 0) < 1000
           AND NOT (COALESCE(s.minute, 0) = 51 AND s.types_of_match_events_id IN (1, 3))
        """
      response_type = "list"
      arg = $input.person_id
    } as $events

    db.direct_query {
      sql = """
        SELECT DISTINCT z.match_id, m.leagues_id
          FROM x1_20 z
          JOIN x1_7 t ON t.id = z.team_id
          JOIN x1_1 m ON m.id = z.match_id
         WHERE t.player_id = ?
        """
      response_type = "list"
      arg = $input.person_id
    } as $appear

    db.query Leagues {
      return = {type: "list"}
      output = ["id", "League", "Relevance", "season_id"]
    } as $leagues

    api.lambda {
      code = """
        const L = Object.fromEntries(($var.leagues || []).map((l) => [l.id, l]));
        const ok = (id) => L[id] && L[id].Relevance !== false;
        const нуль = () => ({ matches: 0, goals: 0, own_goals: 0, yellow_cards: 0, red_cards: 0 });
        const total = нуль(), по = {};
        const рядок = (id) => (по[id] ||= { league: { id: Number(id), name: L[id].League }, ...нуль() });
        for (const a of $var.appear || []) { if (!ok(a.leagues_id)) continue; total.matches++; рядок(a.leagues_id).matches++; }
        const жовті = {};
        for (const e of $var.events || []) {
          if (!ok(e.leagues_id)) continue;
          const r = рядок(e.leagues_id);
          if (Number(e.ev) === 1 && Number(e.goal) === 2) { total.own_goals++; r.own_goals++; }
          else if (Number(e.ev) === 1) { total.goals++; r.goals++; }
          if (Number(e.ev) === 2 && (Number(e.card) === 1 || Number(e.card) === 3)) { total.red_cards++; r.red_cards++; }
          if (Number(e.ev) === 2 && Number(e.card) === 2) { total.yellow_cards++; r.yellow_cards++; (жовті[e.match_id] ||= { l: e.leagues_id, n: 0 }).n++; }
        }
        for (const { l, n } of Object.values(жовті)) if (n >= 2) { total.red_cards++; рядок(l).red_cards++; }
        const by_league = Object.values(по).sort((a, b) => (L[b.league.id].season_id || 0) - (L[a.league.id].season_id || 0) || b.league.id - a.league.id);
        return { person_id: $input.person_id, total, by_league };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
