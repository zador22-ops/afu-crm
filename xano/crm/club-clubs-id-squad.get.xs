query "club/clubs/{teaminfo_id}/squad" verb=GET {
  api_group = "crm"
  auth = "club_account"

  // Склад клубу в кабінеті (задача 3.1; ТЗ 2.2, рішення Андрія 26.10): турніри
  // поточного сезону, де клуб учасник (галочки для нового гравця), зі станом
  // заявкового вікна; чинні гравці складу; відкриті заявки на склад (чернетка
  // / на погодженні) — щоб позначити рядки й показати нових. Лише читання.
  input {
    int teaminfo_id filters=min:1
  }

  stack {
    // СТОРОЖ «лише свій клуб» (контракт 1.1, п. 2.2) — однаковий текст у
    // кожному клубному ендпоінті з teaminfo_id; src/utils/clubGuard.test.js
    // перевіряє, що він є і стоїть до будь-якого читання даних клубу.
    db.get club_account {
      field_name = "id"
      field_value = $auth.id
    } as $guard_account
    precondition ($guard_account != null && $guard_account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }
    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $auth.id && $db.club_account_club.teaminfo_id == $input.teaminfo_id && $db.club_account_club.is_active == true
      return = {type: "count"}
    } as $guard_own
    precondition ($guard_own > 0) {
      error_type = "accessdenied"
      error = "Це не ваш клуб"
    }
    // /СТОРОЖ

    db.query Season {
      return = {type: "list"}
      output = ["id", "is_current"]
    } as $seasons
    db.query Leagues {
      return = {type: "list"}
      output = ["id", "League", "season_id", "Relevance"]
    } as $leagues
    db.query "Tournament participants" {
      where = $db.Tournament_participants.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["leagues_id", "withdrawn"]
    } as $participants
    db.query Team {
      where = $db.Team.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id", "player_id", "Number", "leagues_id", "positions_id", "Captain", "Relevance_of_the_record", "End_date", "Date"]
    } as $cards
    // Додаткові турніри гравця (варіант 3, контракт 4.2 розділ 5): основний — Team.leagues_id
    db.query team_league {
      where = $db.team_league.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id", "team_id", "leagues_id", "Number", "is_active", "End_date"]
    } as $extra
    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Name", "po_batkovi", "Date_of_birth", "Photo", "City", "Growth", "Weight"]
    } as $people
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Position", "Player_position"]
    } as $positions
    db.query registration_window {
      return = {type: "list"}
      output = ["leagues_id", "starts_at", "ends_at"]
    } as $windows
    db.query registration_rule {
      return = {type: "list"}
      output = ["leagues_id", "window_only"]
    } as $rules
    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && ($db.change_request.status == "draft" || $db.change_request.status == "submitted") && ($db.change_request.entity == "squad_row" || $db.change_request.entity == "person")
      sort = {change_request.id: "asc"}
      return = {type: "list"}
      output = ["id", "entity", "action", "entity_id", "leagues_id", "people_id", "depends_on_id", "transfer_from_teaminfo_id", "after", "status"]
    } as $requests
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName"]
    } as $teams

    api.lambda {
      code = """
        const зараз = Date.now();
        const сьогодні = new Date(зараз).toISOString().slice(0, 10);
        const сезон = ($var.seasons || []).find((s) => s.is_current);
        const ліга = new Map(($var.leagues || []).map((l) => [l.id, l]));
        const особа = new Map(($var.people || []).map((p) => [p.id, p]));
        const позиція = new Map(($var.positions || []).map((p) => [p.id, p]));
        const клуб = new Map(($var.teams || []).map((t) => [t.id, t.TeamName]));
        const ім = (p) => (p ? [p.prizvushche, p.Name].filter(Boolean).join(' ') : '');
        // Турніри поточного сезону, де клуб — учасник (не знятий)
        const турніри = (сезон ? ($var.participants || []).filter((u) => !u.withdrawn).map((u) => ліга.get(u.leagues_id)).filter((l) => l && l.season_id === сезон.id && l.Relevance !== false) : [])
          .filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i)
          .map((l) => {
            const лишеУВікні = ($var.rules || []).some((r) => r.leagues_id === l.id && r.window_only === true);
            const вікна = ($var.windows || []).filter((w) => w.leagues_id === l.id);
            const відкрите = вікна.some((w) => Number(w.starts_at) <= зараз && зараз < Number(w.ends_at));
            const наступне = вікна.map((w) => Number(w.starts_at)).filter((t) => t > зараз).sort((a, b) => a - b)[0] || null;
            return { id: l.id, name: l.League, window_only: лишеУВікні, window_open: !лишеУВікні || відкрите, next_window_at: лишеУВікні && !відкрите ? наступне : null };
          });
        const турнірId = new Set(турніри.map((t) => t.id));
        const відкриті = $var.requests || [];
        const заявкаРядка = (teamId) => відкриті.find((r) => r.entity === 'squad_row' && r.entity_id === teamId) || null;
        const діюча = (k) => k.Relevance_of_the_record !== false && (!k.End_date || String(k.End_date) >= сьогодні);
        // Гравець — один рядок Team (основний турнір) + активні додаткові з team_league; у списку,
        // якщо хоч один його турнір — поточного сезону
        const назва = (id) => (ліга.get(id) || {}).League || null;
        const гравці = ($var.cards || []).filter((k) => діюча(k)).map((k) => {
          const p = особа.get(k.player_id) || {};
          const з = заявкаРядка(k.id);
          const також = ($var.extra || []).filter((д) => д.team_id === k.id && д.is_active !== false && (!д.End_date || String(д.End_date) >= сьогодні))
            .map((д) => ({ id: д.id, leagues_id: д.leagues_id, league_name: назва(д.leagues_id), Number: д.Number || null }));
          return {
            team_id: k.id, people_id: k.player_id, name: ім(p), photo: p.Photo || null, Date_of_birth: p.Date_of_birth || null,
            City: p.City || null, Growth: p.Growth || null, Weight: p.Weight || null,
            Number: k.Number || null, positions_id: k.positions_id || null, position: (позиція.get(k.positions_id) || {}).Position || null,
            Captain: !!k.Captain, leagues_id: k.leagues_id, league_name: назва(k.leagues_id), also: також,
            request: з ? { id: з.id, status: з.status, action: з.action, leagues_id: з.leagues_id, after: з.after } : null,
          };
        }).filter((g) => турнірId.has(g.leagues_id) || g.also.some((д) => турнірId.has(д.leagues_id)))
          .sort((a, b) => String(a.league_name).localeCompare(String(b.league_name), 'uk') || (Number(a.Number) || 999) - (Number(b.Number) || 999));
        // Нові в складі (create / transfer), ще не погоджені: ім'я — з People чи з person.create
        const новаОсоба = new Map(відкриті.filter((r) => r.entity === 'person' && r.action === 'create').map((r) => [r.id, r]));
        const нові = відкриті.filter((r) => r.entity === 'squad_row' && (r.action === 'create' || r.action === 'transfer')).map((r) => {
          const н = r.depends_on_id ? новаОсоба.get(r.depends_on_id) : null;
          const p = r.people_id ? особа.get(r.people_id) : null;
          return {
            request_id: r.id, status: r.status, action: r.action, name: p ? ім(p) : н ? ім(н.after) : '',
            new_person: !!н, person_request_id: н ? н.id : null, leagues_id: r.leagues_id, league_name: (ліга.get(r.leagues_id) || {}).League || null,
            Number: (r.after || {}).Number || null, position: (позиція.get((r.after || {}).positions_id) || {}).Position || null,
            transfer_from: r.transfer_from_teaminfo_id ? клуб.get(r.transfer_from_teaminfo_id) || null : null,
          };
        });
        return {
          tournaments: турніри,
          positions: ($var.positions || []).filter((p) => p.Player_position === true).map((p) => ({ id: p.id, name: p.Position })),
          players: гравці,
          pending: нові,
        };
      """
      timeout = 20
    } as $squad
  }

  response = $squad
}
