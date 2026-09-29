query "people/{person_id}" verb=GET {
  api_group = "site"

  // Особа без Date_of_birth і po_batkovi: лише рік народження. Кар'єра — з
  // заявок (Team): клуб, турнір, сезон, номер.
  input {
    int person_id filters=min:1
  }

  stack {
    db.query People {
      where = $db.People.id == $input.person_id
      return = {type: "list"}
      output = ["id", "Name", "prizvushche", "Photo", "Date_of_birth", "City", "Growth", "Weight"]
    } as $rows
    db.query Team {
      where = $db.Team.player_id == $input.person_id
      return = {type: "list"}
      output = ["teaminfo_id", "leagues_id", "Number", "Date", "End_date", "Relevance_of_the_record"]
    } as $career
    db.query Season {
      return = {type: "list"}
      output = ["id", "name"]
    } as $seasons
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo", "TeamInfo", "Relevance", "parent_teaminfo_id", "founded_year", "home_venues_id", "colors", "team_kind", "country", "leagues_id"]
    } as $teams
    db.query Leagues {
      return = {type: "list"}
      output = ["id", "League", "Short_name", "Relevance", "league_id", "season_id"]
    } as $tournaments
    db.query league {
      return = {type: "list"}
      output = ["id", "name", "type", "short_name", "logo", "sort_order", "show_in_app"]
    } as $competitions
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

        const p = ($var.rows || [])[0];
        if (!p) return null;
        const T = byId($var.teams), L = byId($var.tournaments), SE = byId($var.seasons);
        const career = ($var.career || []).map((r) => { const l = L[r.leagues_id]; return { club: club(T[r.teaminfo_id]), league: l ? { id: l.id, name: l.League } : null, season: l && SE[l.season_id] ? { id: l.season_id, name: SE[l.season_id].name } : null, number: r.Number ?? null, date_from: r.Date || null, date_to: r.End_date || null, current: Boolean(r.Relevance_of_the_record) }; })
          .sort((a, b) => String(b.date_from || '').localeCompare(String(a.date_from || '')));
        return { ...personFull(p), Growth: p.Growth || null, Weight: p.Weight || null, career };
      """
      timeout = 15
    } as $out
    precondition ($out != null) {
      error_type = "notfound"
      error = "Особу не знайдено"
    }
  }

  response = $out
}
