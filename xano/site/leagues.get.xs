query leagues verb=GET {
  api_group = "site"

  // Турніри (Leagues) з даними змагання (league). Лише Relevance = true.
  // kind: ліга/кубок; type: національний/міжнародний — з league.type.
  input {
    int season_id?=0
  }

  stack {
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
    db.query Match {
      return = {type: "list"}
      output = ["id", "tours_id", "TimeOfMatch"]
    } as $matches
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

        const C = byId($var.competitions), ST = byId($var.stages);
        const sid = Number($input.season_id) || 0;
        const span = {};
        for (const m of ($var.matches || [])) { if (!m.tours_id || !m.TimeOfMatch) continue; const s = span[m.tours_id] || (span[m.tours_id] = [m.TimeOfMatch, m.TimeOfMatch]); s[0] = Math.min(s[0], m.TimeOfMatch); s[1] = Math.max(s[1], m.TimeOfMatch); }
        return ($var.tournaments || [])
          .filter((t) => t.Relevance === true && (!sid || t.season_id === sid))
          .map((t) => {
            const c = C[t.league_id] || {};
            const tours = ($var.tours || []).filter((x) => x.leagues_id === t.id).sort((a, b) => (tourNo(a.TourName) ?? 999) - (tourNo(b.TourName) ?? 999) || a.id - b.id);
            const stageIds = [...new Set(tours.map((x) => x.league_stage_id).filter(Boolean))].sort((a, b) => a - b);
            return {
              id: t.id, name: t.League, short_name: t.Short_name || null, logo: img(c.logo),
              competition: c.id ? { id: c.id, name: c.name, short_name: c.short_name || null } : null,
              kind: c.type === 'кубок' ? 'кубок' : 'ліга', type: c.type === 'міжнародне' ? 'міжнародний' : 'національний',
              season_id: t.season_id || null, show_in_app: c.show_in_app !== false, sort_order: c.sort_order ?? null,
              stages: stageIds.map((id) => ({ id, name: ST[id] ? ST[id].stage_name : null, type: ST[id] ? ST[id].stage_type : null, sort: id })),
              tours: tours.map((x) => ({ id: x.id, number: tourNo(x.TourName), name: x.TourName, stage_id: x.league_stage_id || null, date_from: span[x.id] ? span[x.id][0] : null, date_to: span[x.id] ? span[x.id][1] : null })),
            };
          })
          .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.id - b.id);
      """
      timeout = 15
    } as $out
  }

  response = $out
}
