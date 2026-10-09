query "leagues/{league_id}/penalties" verb=GET {
  api_group = "site"

  // afu-crm#10 п.3. Пенальті гравців турніру без серії (хв. 51). type=penalty —
  // 6-метровий (тип голу 3), type=double — дабл-пенальті (тип 4). scored — забиті
  // (подія «гол»), missed — незабиті (подія «незабитий пенальті»). Порядок: забиті ↓.
  input {
    int league_id
    text type?=penalty filters=trim
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

        const тип = $input.type === 'double' ? 4 : 3;
        for (const e of $var.events || []) {
          if (Number(e.goal) !== тип) continue;
          if (Number(e.ev) === 1) { const r = рядок(e); r.scored = (r.scored || 0) + 1; }
          if (Number(e.ev) === 3) { const r = рядок(e); r.missed = (r.missed || 0) + 1; }
        }
        return Object.values(рядки).map((r) => ({ ...r, scored: r.scored || 0, missed: r.missed || 0 })).filter((r) => r.scored + r.missed > 0)
          .sort((a, b) => b.scored - a.scored || a.missed - b.missed || String(a.player.last_name).localeCompare(String(b.player.last_name), 'uk'));
      """
      timeout = 20
    } as $out
  }

  response = $out
}
