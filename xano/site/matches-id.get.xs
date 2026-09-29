query "matches/{match_id}" verb=GET {
  api_group = "site"

  // Матч + події, склади, штаб. Особисті поля (делегат, спостерігач,
  // хронометрист, коментарі, дати народження, по батькові) не вибираються.
  input {
    int match_id filters=min:1
  }

  stack {
    db.query Match {
      where = $db.Match.id == $input.match_id
      return = {type: "list"}
      output = ["id", "TimeOfMatch", "team1_id", "Result_team1", "fouls1_team1", "fouls2_team1", "team2_id", "Result_team2", "fouls1_team2", "fouls2_team2", "leagues_id", "tours_id", "venues_id", "match_status_id", "referee1_id", "referee2_id", "referee3_id", "VideoID", "match_number", "num_of_spectators", "minute_break_1_1", "minute_break_1_2", "minute_break_2_1", "minute_break_2_2", "is_top"]
    } as $matches
    db.query Statistic {
      where = $db.Statistic.match_id == $input.match_id
      return = {type: "list"}
      output = ["id", "team_id", "asustent_team_id", "types_of_match_events_id", "types_of_cards_id", "types_of_goals_id", "minute"]
    } as $events
    db.query Zaiuavka {
      where = $db.Zaiuavka.match_id == $input.match_id
      return = {type: "list"}
      output = ["team_id", "First5"]
    } as $lineup
    db.query "Zaiuavka administration of teams" {
      where = $db.Zaiuavka_administration_of_teams.match_id == $input.match_id
      return = {type: "list"}
      output = ["administration_of_teams_id"]
    } as $staffRows
    db.query Team {
      return = {type: "list"}
      output = ["id", "player_id", "teaminfo_id", "Number", "positions_id", "Captain"]
    } as $roster
    db.query "Administration of teams" {
      return = {type: "list"}
      output = ["id", "people_id", "teaminfo_id", "positions_id"]
    } as $admins
    db.query "Types of match events" {
      return = {type: "list"}
      output = ["id", "Event"]
    } as $etypes
    db.query "Types of cards" {
      return = {type: "list"}
      output = ["id", "Type"]
    } as $ctypes
    db.query "Types of goals" {
      return = {type: "list"}
      output = ["id", "Type"]
    } as $gtypes
    db.query People {
      return = {type: "list"}
      output = ["id", "Name", "prizvushche", "Photo", "Date_of_birth", "City", "Growth", "Weight"]
    } as $people
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Position"]
    } as $positions
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo", "TeamInfo", "Relevance", "parent_teaminfo_id", "founded_year", "home_venues_id", "colors", "team_kind", "country", "leagues_id"]
    } as $teams
    db.query Venues {
      return = {type: "list"}
      output = ["id", "City", "name", "city", "address", "capacity", "photo"]
    } as $venues
    db.query Judges {
      return = {type: "list"}
      output = ["id", "Name", "prizvushche", "photo", "Relevance", "Date_of_birth", "City"]
    } as $judges
    db.query Leagues {
      return = {type: "list"}
      output = ["id", "League", "Short_name", "Relevance", "league_id", "season_id"]
    } as $tournaments
    db.query league {
      return = {type: "list"}
      output = ["id", "name", "type", "short_name", "logo", "sort_order", "show_in_app"]
    } as $competitions
    db.query Tours {
      return = {type: "list"}
      output = ["id", "TourName", "leagues_id", "league_stage_id"]
    } as $tours
    db.query "League stage" {
      return = {type: "list"}
      output = ["id", "stage_name", "stage_type"]
    } as $stages
    db.query Match_status {
      return = {type: "list"}
      output = ["id", "Status"]
    } as $statuses
    api.lambda {
      code = """

        const img = (i) => (i && i.url ? { url: i.url, width: (i.meta && i.meta.width) || null, height: (i.meta && i.meta.height) || null } : null);
        const byId = (rows) => Object.fromEntries((rows || []).map((r) => [r.id, r]));
        const year = (d) => { if (!d) return null; const m = String(d).match(/^(\d{4})/); return m ? Number(m[1]) : null; };
        const person = (p) => (p ? { id: p.id, first_name: p.Name || null, last_name: p.prizvushche || null } : null);
        const personFull = (p) => (p ? { ...person(p), photo: img(p.Photo || p.photo), birth_year: year(p.Date_of_birth), city: p.City || null } : null);
        const club = (t) => (t ? { id: t.id, name: t.TeamName, logo: img(t.TeamLogo) } : null);
        const venue = (v) => (v ? { id: v.id, name: (v.name && String(v.name).trim()) || v.City || null, city: v.city || null } : null);
        const tourNo = (name) => { const m = String(name || '').match(/(\d+)/); return m ? Number(m[1]) : null; };
        const page = (rows, p, pp) => { const per = Math.min(Math.max(Number(pp) || 50, 1), 100); const pg = Math.max(Number(p) || 1, 1); return { items: rows.slice((pg - 1) * per, pg * per), total: rows.length, page: pg, per_page: per, totalPages: Math.max(1, Math.ceil(rows.length / per)) }; };
        // Київська північ для дати «YYYY-MM-DD» (з урахуванням літнього часу)
        const kyivDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); const g = Date.UTC(y, m - 1, d); const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(g)).map((x) => [x.type, x.value])); return g - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - g); };
        const when = (v, end) => { if (v === null || v === undefined || v === '') return null; if (/^\d+$/.test(String(v))) return Number(v); if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return kyivDay(v) + (end ? 86400000 - 1 : 0); const t = Date.parse(v); return isNaN(t) ? null : t; };


        const T = byId($var.teams), V = byId($var.venues), J = byId($var.judges), TR = byId($var.tours), ST = byId($var.stages), L = byId($var.tournaments);
        const S = Object.fromEntries(($var.statuses || []).map((s) => [s.id, s.Status]));
        const live = (m) => L[m.leagues_id] && L[m.leagues_id].Relevance === true;
        const shape = (m) => {
          const tr = TR[m.tours_id]; const st = tr && ST[tr.league_stage_id];
          return {
            id: m.id, TimeOfMatch: m.TimeOfMatch, league_id: m.leagues_id, tour_id: m.tours_id || null,
            tour: tr ? { id: tr.id, number: tourNo(tr.TourName), name: tr.TourName } : null,
            stage: st ? { id: st.id, name: st.stage_name, type: st.stage_type } : null,
            match_number: m.match_number || null,
            teams: [club(T[m.team1_id]), club(T[m.team2_id])],
            result: m.match_status_id > 2 ? [m.Result_team1 ?? 0, m.Result_team2 ?? 0] : null,
            fouls: { team1: [Boolean(m.fouls1_team1), Boolean(m.fouls2_team1)], team2: [Boolean(m.fouls1_team2), Boolean(m.fouls2_team2)] },
            status: { id: m.match_status_id, name: S[m.match_status_id] || null },
            venue: venue(V[m.venues_id]),
            referees: [m.referee1_id, m.referee2_id, m.referee3_id].map((id) => person(J[id])).filter(Boolean),
            is_top: Boolean(m.is_top), video_id: m.VideoID || null, spectators: m.num_of_spectators || null,
            breaks: [m.minute_break_1_1, m.minute_break_1_2, m.minute_break_2_1, m.minute_break_2_2].map((x) => (x === undefined ? null : x)),
          };
        };
        const m = ($var.matches || [])[0];
        if (!m || !live(m)) return null;
        const R = byId($var.roster), A = byId($var.admins), P = byId($var.people), POS = byId($var.positions);
        const E = byId($var.etypes), CT = byId($var.ctypes), GT = byId($var.gtypes);
        const player = (row) => (row ? { ...person(P[row.player_id]), number: row.Number ?? null, team_id: row.teaminfo_id } : null);
        const events = ($var.events || []).map((e) => {
          const r = R[e.team_id];
          return {
            id: e.id, minute: e.minute ?? null,
            type_id: e.types_of_match_events_id || null, type_name: E[e.types_of_match_events_id] ? E[e.types_of_match_events_id].Event : null,
            card: e.types_of_cards_id ? { id: e.types_of_cards_id, name: CT[e.types_of_cards_id] ? CT[e.types_of_cards_id].Type : null } : null,
            goal: e.types_of_goals_id ? { id: e.types_of_goals_id, name: GT[e.types_of_goals_id] ? GT[e.types_of_goals_id].Type : null } : null,
            team_id: r ? r.teaminfo_id : null, player: player(r), assist: player(R[e.asustent_team_id]),
          };
        }).sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || a.id - b.id);
        const lineups = ($var.lineup || []).map((z) => { const r = R[z.team_id]; if (!r) return null; return { team_id: r.teaminfo_id, player: person(P[r.player_id]), number: r.Number ?? null, position: POS[r.positions_id] ? POS[r.positions_id].Position : null, is_captain: Boolean(r.Captain), starting: Boolean(z.First5) }; }).filter(Boolean);
        const staff = ($var.staffRows || []).map((s) => { const a = A[s.administration_of_teams_id]; if (!a) return null; return { team_id: a.teaminfo_id, person: person(P[a.people_id]), position: POS[a.positions_id] ? POS[a.positions_id].Position : null }; }).filter(Boolean);
        return { ...shape(m), events, lineups, staff };
      """
      timeout = 15
    } as $out
    precondition ($out != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }
  }

  response = $out
}
