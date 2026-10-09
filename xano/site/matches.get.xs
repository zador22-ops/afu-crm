query matches verb=GET {
  api_group = "site"

  // Матчі без особистих і службових полів: делегата, спостерігача,
  // хронометриста й коментарів тут немає — вони навіть не вибираються.
  // date_from / date_to: мс або «YYYY-MM-DD» (день за Києвом включно).
  input {
    int league_id?=0
    int tour_id?=0
    int club_id?=0
    // afu-crm#10 п.7: матчі арени
    int venue_id?=0
    text date_from? filters=trim
    text date_to? filters=trim
    int page?=1
    int per_page?=50
  }

  stack {
    db.query Match {
      return = {type: "list"}
      output = ["id", "TimeOfMatch", "team1_id", "Result_team1", "fouls1_team1", "fouls2_team1", "team2_id", "Result_team2", "fouls1_team2", "fouls2_team2", "leagues_id", "tours_id", "venues_id", "match_status_id", "referee1_id", "referee2_id", "referee3_id", "VideoID", "match_number", "num_of_spectators", "minute_break_1_1", "minute_break_1_2", "minute_break_2_1", "minute_break_2_2", "is_top"]
    } as $matches

    // afu-crm#10 п.6: голи серії пенальті (хв. 51) окремо від рахунку матчу.
    // Result у базі містить і серію (його пише CRM table recalc / ADMIN з усіх голів).
    db.direct_query {
      sql = """
        SELECT s.match_id, t.teaminfo_id, COUNT(*) AS n
          FROM x1_11 s JOIN x1_7 t ON t.id = s.team_id
         WHERE s.minute = 51 AND s.types_of_match_events_id = 1
         GROUP BY s.match_id, t.teaminfo_id
        """
      response_type = "list"
    } as $shootout
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo", "TeamInfo", "Relevance", "parent_teaminfo_id", "founded_year", "home_venues_id", "colors", "team_kind", "country", "leagues_id", "kit_color_primary", "kit_color_secondary"]
    } as $teams
    db.query Venues {
      return = {type: "list"}
      output = ["id", "City"]
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
        const club = (t) => (t ? { id: t.id, name: t.TeamName, logo: img(t.TeamLogo), kit_color_primary: t.kit_color_primary || null, kit_color_secondary: t.kit_color_secondary || null } : null);
        const venue = (v) => (v ? { id: v.id, name: v.City || null, city: null } : null);
        const tourNo = (name) => { const m = String(name || '').match(/(\d+)/); return m ? Number(m[1]) : null; };
        const page = (rows, p, pp) => { const per = Math.min(Math.max(Number(pp) || 50, 1), 100); const pg = Math.max(Number(p) || 1, 1); return { items: rows.slice((pg - 1) * per, pg * per), total: rows.length, page: pg, per_page: per, totalPages: Math.max(1, Math.ceil(rows.length / per)) }; };
        // Київська північ для дати «YYYY-MM-DD» (з урахуванням літнього часу)
        const kyivDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); const g = Date.UTC(y, m - 1, d); const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(g)).map((x) => [x.type, x.value])); return g - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - g); };
        const when = (v, end) => { if (v === null || v === undefined || v === '') return null; if (/^\d+$/.test(String(v))) return Number(v); if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return kyivDay(v) + (end ? 86400000 - 1 : 0); const t = Date.parse(v); return isNaN(t) ? null : t; };


        const T = byId($var.teams), V = byId($var.venues), J = byId($var.judges), TR = byId($var.tours), ST = byId($var.stages), L = byId($var.tournaments);
        const S = Object.fromEntries(($var.statuses || []).map((s) => [s.id, s.Status]));
        const live = (m) => L[m.leagues_id] && L[m.leagues_id].Relevance === true;
        const СЕРІЯ = {};
        for (const s of $var.shootout || []) (СЕРІЯ[s.match_id] ||= {})[s.teaminfo_id] = Number(s.n);
        // result — рахунок матчу без серії; penalty — серія [команда1, команда2] або null
        const рахунок = (m) => {
          if (!(m.match_status_id > 2)) return { result: null, penalty: null };
          const s = СЕРІЯ[m.id];
          const p1 = s ? s[m.team1_id] || 0 : 0, p2 = s ? s[m.team2_id] || 0 : 0;
          return { result: [Math.max(0, (m.Result_team1 ?? 0) - p1), Math.max(0, (m.Result_team2 ?? 0) - p2)], penalty: s ? [p1, p2] : null };
        };
        const shape = (m) => {
          const tr = TR[m.tours_id]; const st = tr && ST[tr.league_stage_id];
          return {
            id: m.id, TimeOfMatch: m.TimeOfMatch, league_id: m.leagues_id, tour_id: m.tours_id || null,
            tour: tr ? { id: tr.id, number: tourNo(tr.TourName), name: tr.TourName } : null,
            stage: st ? { id: st.id, name: st.stage_name, type: st.stage_type } : null,
            match_number: m.match_number || null,
            teams: [club(T[m.team1_id]), club(T[m.team2_id])],
            ...рахунок(m),
            fouls: { team1: [Boolean(m.fouls1_team1), Boolean(m.fouls2_team1)], team2: [Boolean(m.fouls1_team2), Boolean(m.fouls2_team2)] },
            status: { id: m.match_status_id, name: S[m.match_status_id] || null },
            venue: venue(V[m.venues_id]),
            referees: [m.referee1_id, m.referee2_id, m.referee3_id].map((id) => person(J[id])).filter(Boolean),
            is_top: Boolean(m.is_top), video_id: m.VideoID || null, spectators: m.num_of_spectators || null,
            breaks: [m.minute_break_1_1, m.minute_break_1_2, m.minute_break_2_1, m.minute_break_2_2].map((x) => (x === undefined ? null : x)),
          };
        };
        const lg = Number($input.league_id) || 0, tr = Number($input.tour_id) || 0, cl = Number($input.club_id) || 0;
        const from = when($input.date_from, false), to = when($input.date_to, true);
        const rows = ($var.matches || [])
          .filter(live)
          .filter((m) => !lg || m.leagues_id === lg)
          .filter((m) => !tr || m.tours_id === tr)
          .filter((m) => !cl || m.team1_id === cl || m.team2_id === cl)
          .filter((m) => !Number($input.venue_id) || m.venues_id === Number($input.venue_id))
          .filter((m) => from === null || (m.TimeOfMatch || 0) >= from)
          .filter((m) => to === null || (m.TimeOfMatch || 0) <= to)
          .sort((a, b) => (a.TimeOfMatch || 0) - (b.TimeOfMatch || 0) || a.id - b.id);
        const p = page(rows, $input.page, $input.per_page);
        return { ...p, items: p.items.map(shape) };
      """
      timeout = 15
    } as $out
  }

  response = $out
}
