query "clubs/{club_id}/staff" verb=GET {
  api_group = "site"

  // Штаб клубу одним списком з історією (date_to порожній — чинний)
  input {
    int club_id filters=min:1
  }

  stack {
    db.get TeamInfo {
      field_name = "id"
      field_value = $input.club_id
    } as $team
    precondition ($team != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }
    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.club_id
      return = {type: "list"}
      output = ["id", "people_id", "positions_id", "Date", "end_date", "Relevance_of_the_record", "leagues_id"]
    } as $rows
    db.query People {
      return = {type: "list"}
      output = ["id", "Name", "prizvushche", "Photo", "Date_of_birth", "City", "Growth", "Weight"]
    } as $people
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Position"]
    } as $positions
    api.lambda {
      code = """

        const img = (i) => (i && i.url ? { url: i.url, width: (i.meta && i.meta.width) || null, height: (i.meta && i.meta.height) || null } : null);
        const byId = (rows) => Object.fromEntries((rows || []).map((r) => [r.id, r]));
        const year = (d) => { if (!d) return null; const m = String(d).match(/^(\d{4})/); return m ? Number(m[1]) : null; };
        const person = (p) => (p ? { id: p.id, first_name: p.Name || null, last_name: p.prizvushche || null } : null);
        const personFull = (p) => (p ? { ...person(p), photo: img(p.Photo || p.photo), birth_year: year(p.Date_of_birth), city: p.City || null } : null);
        const club = (t) => (t ? { id: t.id, name: t.TeamName, short: null, logo: img(t.TeamLogo) } : null);
        const venue = (v) => (v ? { id: v.id, name: v.City || null, city: null } : null);
        const tourNo = (name) => { const m = String(name || '').match(/(\d+)/); return m ? Number(m[1]) : null; };
        const page = (rows, p, pp) => { const per = Math.min(Math.max(Number(pp) || 50, 1), 100); const pg = Math.max(Number(p) || 1, 1); return { items: rows.slice((pg - 1) * per, pg * per), total: rows.length, page: pg, per_page: per, totalPages: Math.max(1, Math.ceil(rows.length / per)) }; };
        // Київська північ для дати «YYYY-MM-DD» (з урахуванням літнього часу)
        const kyivDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); const g = Date.UTC(y, m - 1, d); const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(g)).map((x) => [x.type, x.value])); return g - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - g); };
        const when = (v, end) => { if (v === null || v === undefined || v === '') return null; if (/^\d+$/.test(String(v))) return Number(v); if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return kyivDay(v) + (end ? 86400000 - 1 : 0); const t = Date.parse(v); return isNaN(t) ? null : t; };

        const P = byId($var.people), POS = byId($var.positions);
        return ($var.rows || [])
          .map((r) => { const p = P[r.people_id]; return { person: p ? { ...person(p), photo: img(p.Photo) } : null, position: POS[r.positions_id] ? POS[r.positions_id].Position : null, date_from: r.Date || null, date_to: r.end_date || null, current: Boolean(r.Relevance_of_the_record), league_id: r.leagues_id || null }; })
          .sort((a, b) => (b.current - a.current) || String(b.date_from || '').localeCompare(String(a.date_from || '')));
      """
      timeout = 15
    } as $out
  }

  response = $out
}
