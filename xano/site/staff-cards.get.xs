query "staff-cards" verb=GET {
  api_group = "site"

  // Картки штабу матчу (тренери, адміністратори)
  input {
    int match_id filters=min:1
  }

  stack {
    db.query "Statistic Administration of teams" {
      where = $db.Statistic_Administration_of_teams.match_id == $input.match_id
      return = {type: "list"}
      output = ["id", "administration_of_teams_id", "types_of_cards_id", "minute"]
    } as $rows
    db.query "Administration of teams" {
      return = {type: "list"}
      output = ["id", "people_id", "teaminfo_id", "positions_id"]
    } as $admins
    db.query "Types of cards" {
      return = {type: "list"}
      output = ["id", "Type"]
    } as $ctypes
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

        const A = byId($var.admins), P = byId($var.people), POS = byId($var.positions), CT = byId($var.ctypes);
        return ($var.rows || []).map((r) => { const a = A[r.administration_of_teams_id]; return { id: r.id, minute: r.minute ?? null, card: r.types_of_cards_id ? { id: r.types_of_cards_id, name: CT[r.types_of_cards_id] ? CT[r.types_of_cards_id].Type : null } : null, team_id: a ? a.teaminfo_id : null, person: a ? person(P[a.people_id]) : null, position: a && POS[a.positions_id] ? POS[a.positions_id].Position : null }; })
          .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || a.id - b.id);
      """
      timeout = 15
    } as $out
  }

  response = $out
}
