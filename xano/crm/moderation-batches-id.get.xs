query "moderation/batches/{batch_id}" verb=GET {
  api_group = "crm"
  auth = "Users"

  // «Погодження» — пакет із рядками «було / стане» (4.1). Право 21. Для показу
  // (нічого не пише): назви клубу, особи, турніру, посади, арени; перехід «зі
  // старого клубу»; куди піде рядок складу (Team чи team_league, варіант 3);
  // виведення з основного турніру, коли основним стане інший (контракт 4.2,
  // розділ 5); заявкове вікно турніру зараз.
  input {
    int batch_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get change_batch {
      field_name = "id"
      field_value = $input.batch_id
    } as $batch
    precondition ($batch != null) {
      error_type = "notfound"
      error = "Пакет не знайдено"
    }
    db.query change_request {
      where = $db.change_request.batch_id == $input.batch_id
      sort = {change_request.id: "asc"}
      return = {type: "list"}
      output = ["id", "entity", "action", "entity_id", "leagues_id", "people_id", "depends_on_id", "transfer_from_team_id", "transfer_from_teaminfo_id", "before", "after", "status", "club_comment", "decision_comment", "decided_at", "decision_users_id", "applied_at", "applied_entity_id", "apply_error"]
    } as $rows
    db.query Team {
      where = $db.Team.teaminfo_id == $batch.teaminfo_id
      return = {type: "list"}
      output = ["id", "player_id", "leagues_id", "Number", "positions_id", "Captain", "Relevance_of_the_record", "End_date"]
    } as $cards
    db.query team_league {
      where = $db.team_league.teaminfo_id == $batch.teaminfo_id
      return = {type: "list"}
      output = ["id", "team_id", "leagues_id", "Number", "Date", "is_active", "End_date"]
    } as $extra
    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Name", "po_batkovi", "Date_of_birth", "Photo"]
    } as $people
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName"]
    } as $teams
    db.query Leagues {
      return = {type: "list"}
      output = ["id", "League"]
    } as $leagues
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Position"]
    } as $positions
    db.query Venues {
      return = {type: "list"}
      output = ["id", "City"]
    } as $venues
    db.query registration_window {
      return = {type: "list"}
      output = ["leagues_id", "starts_at", "ends_at"]
    } as $windows
    db.query registration_rule {
      return = {type: "list"}
      output = ["leagues_id", "window_only"]
    } as $rules
    db.query Users {
      return = {type: "list"}
      output = ["id", "Name"]
    } as $users

    api.lambda {
      code = """
        const зараз = Date.now();
        const сьогодні = new Date(зараз).toISOString().slice(0, 10);
        const b = $var.batch;
        const мапа = (xs, поле) => new Map((xs || []).map((x) => [x.id, x[поле]]));
        const клуб = мапа($var.teams, 'TeamName');
        const ліга = мапа($var.leagues, 'League');
        const посада = мапа($var.positions, 'Position');
        const арена = мапа($var.venues, 'City');
        const людина = мапа($var.users, 'Name');
        const особа = new Map(($var.people || []).map((p) => [p.id, p]));
        const ім = (p) => (p ? [p.prizvushche, p.Name, p.po_batkovi].filter(Boolean).join(' ') : '');
        const рядки = $var.rows || [];
        const заявка = new Map(рядки.map((r) => [r.id, r]));
        const діє = (k) => k.Relevance_of_the_record !== false && (!k.End_date || String(k.End_date) >= сьогодні);
        const діюДод = (д) => д.is_active !== false && (!д.End_date || String(д.End_date) >= сьогодні);
        const вікно = (id) => {
          if (!($var.rules || []).some((r) => r.leagues_id === id && r.window_only === true)) return true;
          return ($var.windows || []).some((w) => w.leagues_id === id && Number(w.starts_at) <= зараз && зараз < Number(w.ends_at));
        };
        const картка = (id) => ($var.cards || []).find((k) => k.id === id) || null;
        // Перший рядок складу нової особи в пакеті (за id) стане основним — решта в team_league
        const першийНової = new Map();
        for (const r of рядки) if (r.entity === 'squad_row' && r.depends_on_id && !першийНової.has(r.depends_on_id)) першийНової.set(r.depends_on_id, r.id);

        const подати = (r) => {
          const н = r.depends_on_id ? заявка.get(r.depends_on_id) : null;
          const p = r.people_id ? особа.get(r.people_id) : r.entity === 'person' && r.entity_id ? особа.get(r.entity_id) : null;
          const k = r.entity === 'squad_row' && r.entity_id ? картка(r.entity_id) : null;
          const out = {
            ...r,
            person_name: p ? ім(p) : н ? ім(н.after) : r.entity === 'person' && r.action === 'create' ? ім(r.after) : null,
            person_photo: p && p.Photo ? p.Photo : null,
            new_person: !!н || (r.entity === 'person' && r.action === 'create'),
            league_name: r.leagues_id ? ліга.get(r.leagues_id) || null : null,
            transfer_from_name: r.transfer_from_teaminfo_id ? клуб.get(r.transfer_from_teaminfo_id) || null : null,
            decision_name: r.decision_users_id ? людина.get(r.decision_users_id) || null : null,
            // person.create рішення не має: воно виводиться з рядків, що на нього посилаються (рішенняОсоби)
            decidable: r.status === 'submitted' && !(r.entity === 'person' && r.action === 'create'),
            window_open: r.entity === 'squad_row' && r.leagues_id ? вікно(r.leagues_id) : null,
            target: null,
            primary_change: null,
          };
          if (r.entity === 'squad_row' && (r.action === 'create' || r.action === 'transfer')) {
            const уКлубі = r.people_id && ($var.cards || []).some((x) => x.player_id === r.people_id && діє(x));
            out.target = уКлубі || (r.depends_on_id && першийНової.get(r.depends_on_id) !== r.id) ? 'team_league' : 'Team';
          }
          if (r.entity === 'squad_row' && r.action === 'remove' && k) {
            const додаткові = ($var.extra || []).filter((д) => д.team_id === k.id && діюДод(д));
            if (r.leagues_id && r.leagues_id !== k.leagues_id) out.target = 'team_league';
            else if (додаткові.length) {
              // як планВивестиЗТурніру: основним стає найраніший додатковий
              const наступний = [...додаткові].sort((a, b) => String(a.Date || '').localeCompare(String(b.Date || '')) || a.id - b.id)[0];
              out.primary_change = { leagues_id: наступний.leagues_id, league_name: ліга.get(наступний.leagues_id) || null, Number: наступний.Number || null };
            }
          }
          if (r.entity === 'squad_row' && r.action === 'update' && k && r.leagues_id && r.leagues_id !== k.leagues_id) out.target = 'team_league';
          return out;
        };
        // Назви для полів-посилань у before / after
        const довідка = { positions: {}, venues: {} };
        for (const r of рядки) for (const x of [r.before, r.after]) {
          if (x && x.positions_id) довідка.positions[x.positions_id] = посада.get(Number(x.positions_id)) || null;
          if (x && x.home_venues_id) довідка.venues[x.home_venues_id] = арена.get(Number(x.home_venues_id)) || null;
        }
        return {
          batch: {
            id: b.id, teaminfo_id: b.teaminfo_id, club_name: клуб.get(b.teaminfo_id) || null, status: b.status, title: b.title || null,
            club_comment: b.club_comment || null, submitted_at: b.submitted_at, closed_at: b.closed_at || null, withdrawn_at: b.withdrawn_at || null,
            acted_by_name: b.acted_by_users_id ? людина.get(b.acted_by_users_id) || 'Адмін' : null,
          },
          rows: рядки.map(подати),
          labels: довідка,
        };
      """
      timeout = 20
    } as $result
  }

  response = $result
}
