query "leagues/{league_id}/table" verb=GET {
  api_group = "site"

  // Турнірна таблиця — та сама сума рядків Table, що в застосунку
  // (Default table/byLig/byStageId): очки, різниця, забиті. Етап — переданий
  // stage_id або етап типу «таблиця» цього турніру. Перемоги/нічиї/поразки —
  // з очок матчу (3/1/0). Зона — з league_zone.
  input {
    int league_id filters=min:1
    int stage_id?=0
  }

  stack {
    db.get Leagues {
      field_name = "id"
      field_value = $input.league_id
    } as $tournament
    precondition ($tournament != null && $tournament.Relevance == true) {
      error_type = "notfound"
      error = "Турнір не знайдено"
    }
    db.query Table {
      where = $db.Table.leagues_id == $input.league_id
      return = {type: "list"}
      output = ["teaminfo_id", "match_id", "Games", "Goals_scored", "Conceded_goals", "Goal_difference", "Points", "league_stage_id"]
    } as $rows
    db.query Tours {
      where = $db.Tours.leagues_id == $input.league_id
      return = {type: "list"}
      output = ["league_stage_id"]
    } as $tours
    db.query "League stage" {
      return = {type: "list"}
      output = ["id", "stage_type"]
    } as $stages
    db.query league_zone {
      where = $db.league_zone.leagues_id == $input.league_id
      return = {type: "list"}
      output = ["league_stage_id", "zone_type", "place_from", "place_to", "label"]
    } as $zones
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo", "TeamInfo", "Relevance", "parent_teaminfo_id", "founded_year", "home_venues_id", "colors", "team_kind", "country", "leagues_id"]
    } as $teams
    api.lambda {
      code = """

        const img = (i) => (i && i.url ? { url: i.url, width: (i.meta && i.meta.width) || null, height: (i.meta && i.meta.height) || null } : null);
        const byId = (rows) => Object.fromEntries((rows || []).map((r) => [r.id, r]));
        const year = (d) => { if (!d) return null; const m = String(d).match(/^(\d{4})/); return m ? Number(m[1]) : null; };
        const person = (p) => (p ? { id: p.id, first_name: p.Name || null, last_name: p.prizvushche || null } : null);
        const personFull = (p) => (p ? { ...person(p), photo: img(p.Photo || p.photo), birth_year: year(p.Date_of_birth), city: p.City || null } : null);
        const club = (t) => (t ? { id: t.id, name: t.TeamName, logo: img(t.TeamLogo) } : null);
        const venue = (v) => (v ? { id: v.id, name: v.City || null, city: null } : null);
        const tourNo = (name) => { const m = String(name || '').match(/(\d+)/); return m ? Number(m[1]) : null; };
        const page = (rows, p, pp) => { const per = Math.min(Math.max(Number(pp) || 50, 1), 100); const pg = Math.max(Number(p) || 1, 1); return { items: rows.slice((pg - 1) * per, pg * per), total: rows.length, page: pg, per_page: per, totalPages: Math.max(1, Math.ceil(rows.length / per)) }; };
        // Київська північ для дати «YYYY-MM-DD» (з урахуванням літнього часу)
        const kyivDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); const g = Date.UTC(y, m - 1, d); const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(g)).map((x) => [x.type, x.value])); return g - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - g); };
        const when = (v, end) => { if (v === null || v === undefined || v === '') return null; if (/^\d+$/.test(String(v))) return Number(v); if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return kyivDay(v) + (end ? 86400000 - 1 : 0); const t = Date.parse(v); return isNaN(t) ? null : t; };

        const T = byId($var.teams), ST = byId($var.stages);
        let stage = Number($input.stage_id) || 0;
        if (!stage) { const ids = [...new Set(($var.tours || []).map((t) => t.league_stage_id))]; stage = ids.find((id) => ST[id] && ST[id].stage_type === 'таблиця') || 0; }
        const acc = {};
        for (const r of ($var.rows || [])) {
          if (r.league_stage_id !== stage) continue;
          const a = acc[r.teaminfo_id] || (acc[r.teaminfo_id] = { games: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points: 0 });
          a.games += r.Games || 0; a.goals_for += r.Goals_scored || 0; a.goals_against += r.Conceded_goals || 0; a.goal_difference += r.Goal_difference || 0; a.points += r.Points || 0;
          if ((r.Games || 0) > 0) { if (r.Points >= 3) a.wins++; else if (r.Points === 1) a.draws++; else a.losses++; }
        }
        const zones = ($var.zones || []).filter((z) => z.league_stage_id === stage);
        const rows = Object.entries(acc).map(([id, a]) => ({ club: club(T[id]), ...a }))
          .sort((a, b) => b.points - a.points || b.goal_difference - a.goal_difference || b.goals_for - a.goals_for);
        rows.forEach((r, i) => { r.place = i + 1; const z = zones.find((x) => r.place >= x.place_from && r.place <= x.place_to); r.zone = z ? { zone_type: z.zone_type, name: (z.label && String(z.label).trim()) || null } : null; });
        return { stage_id: stage || null, rows };
      """
      timeout = 15
    } as $out
  }

  response = $out
}
