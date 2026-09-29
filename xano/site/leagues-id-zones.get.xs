query "leagues/{league_id}/zones" verb=GET {
  api_group = "site"

  // Колір — з типу зони (окремого поля в базі немає): playoff синій, promotion
  // зелений, europe жовтий, relegation червоний. name — підпис з CRM або null.
  input {
    int league_id filters=min:1
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
    db.query league_zone {
      where = $db.league_zone.leagues_id == $input.league_id
      return = {type: "list"}
      output = ["id", "league_stage_id", "zone_type", "place_from", "place_to", "label"]
    } as $rows
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

        const COLOR = { playoff: '#1676BC', promotion: '#1A7F4B', europe: '#FFF200', relegation: '#B42318' };
        return ($var.rows || []).map((z) => ({ id: z.id, name: (z.label && String(z.label).trim()) || null, zone_type: z.zone_type, color: COLOR[z.zone_type] || null, place_from: z.place_from, place_to: z.place_to, stage_id: z.league_stage_id }))
          .sort((a, b) => a.stage_id - b.stage_id || a.place_from - b.place_from);
      """
      timeout = 15
    } as $out
  }

  response = $out
}
