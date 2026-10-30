query "club/clubs/{teaminfo_id}/players" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // Додати гравця до складу — чернетки заявок (задача 3.1; ТЗ 2.2, рішення
  // Андрія 26.10; контракт 1.1 п. 3). Особа — наявна (people_id, знайдена
  // пошуком) або нова (person.create). Турніри — галочками: на КОЖЕН свій
  // squad_row.create; якщо особа активна в іншому клубі (не материнський/фарм)
  // — squad_row.transfer. Номер — окремо на турнір, унікальний у складі
  // турніру й не 0; закрите заявкове вікно — відмова. В основні таблиці —
  // нічого (лише change_request).
  // Варіант 3 (рішення Андрія 30.10): рядки пишуться в порядку rows — перший
  // обраний турнір стає основним (Team), решта — team_league; для гравця, що
  // вже в складі клубу, основний лишається його поточний.
  input {
    int teaminfo_id filters=min:1
    // {people_id} або {new: {prizvushche, Name, po_batkovi?, Date_of_birth, Photo?, City?, Growth?, Weight?}}
    json person
    // [{leagues_id, Number, positions_id, Captain?}]
    json rows
    text club_comment? filters=trim
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
      output = ["id", "season_id", "Relevance"]
    } as $leagues
    db.query "Tournament participants" {
      where = $db.Tournament_participants.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["leagues_id", "withdrawn"]
    } as $participants
    db.query registration_window {
      return = {type: "list"}
      output = ["leagues_id", "starts_at", "ends_at"]
    } as $windows
    db.query registration_rule {
      return = {type: "list"}
      output = ["leagues_id", "window_only"]
    } as $rules
    db.query Team {
      return = {type: "list"}
      output = ["id", "player_id", "teaminfo_id", "leagues_id", "Number", "Relevance_of_the_record", "End_date"]
    } as $cards
    // Додаткові турніри (варіант 3): номер і «вже заявлений» рахуються й за ними
    db.query team_league {
      where = $db.team_league.teaminfo_id == $input.teaminfo_id && $db.team_league.is_active == true
      return = {type: "list"}
      output = ["team_id", "people_id", "leagues_id", "Number", "End_date"]
    } as $extra
    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Date_of_birth"]
    } as $people
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "parent_teaminfo_id"]
    } as $clubs
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Player_position"]
    } as $positions
    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && ($db.change_request.status == "draft" || $db.change_request.status == "submitted") && $db.change_request.entity == "squad_row"
      return = {type: "list"}
      output = ["id", "action", "entity_id", "leagues_id", "people_id", "after"]
    } as $open

    api.lambda {
      code = """
        const зараз = Date.now();
        const сьогодні = new Date(зараз).toISOString().slice(0, 10);
        const сезон = ($var.seasons || []).find((s) => s.is_current);
        const лігиСезону = new Set(($var.leagues || []).filter((l) => сезон && l.season_id === сезон.id && l.Relevance !== false).map((l) => l.id));
        const турнірКлубу = new Set(($var.participants || []).filter((u) => !u.withdrawn && лігиСезону.has(u.leagues_id)).map((u) => u.leagues_id));
        const вікноВідкрите = (id) => {
          if (!($var.rules || []).some((r) => r.leagues_id === id && r.window_only === true)) return true;
          return ($var.windows || []).some((w) => w.leagues_id === id && Number(w.starts_at) <= зараз && зараз < Number(w.ends_at));
        };
        const клубId = Number($input.teaminfo_id);
        const норм = (s) => String(s || '').trim().toLowerCase();
        const текст = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max + 1));
        const діюча = (k) => k.Relevance_of_the_record !== false && (!k.End_date || String(k.End_date) >= сьогодні);
        const додаткові = ($var.extra || []).filter((д) => !д.End_date || String(д.End_date) >= сьогодні);
        const особа = $input.person && typeof $input.person === 'object' ? $input.person : {};
        const рядки = Array.isArray($input.rows) ? $input.rows : [];
        const ok = { person_ok: true, dup_ok: true, fields_ok: true, rows_ok: true, league_ok: true, window_ok: true, number_ok: true, position_ok: true, already_ok: true };

        // ——— Особа ———
        let people_id = null;
        let person_after = null;
        if (особа.people_id) {
          people_id = Number(особа.people_id);
          if (!($var.people || []).some((p) => p.id === people_id)) ok.person_ok = false;
        } else if (особа.new && typeof особа.new === 'object') {
          const н = особа.new;
          const dob = String(н.Date_of_birth || '').slice(0, 10);
          person_after = {
            prizvushche: текст(н.prizvushche, 100), Name: текст(н.Name, 100), po_batkovi: текст(н.po_batkovi, 100),
            Date_of_birth: dob, City: текст(н.City, 100),
            Growth: н.Growth == null || н.Growth === '' ? null : Number(н.Growth),
            Weight: н.Weight == null || н.Weight === '' ? null : Number(н.Weight),
          };
          if (н.Photo) person_after.Photo = н.Photo;
          const рік = Number(dob.slice(0, 4));
          if (!person_after.prizvushche || !person_after.Name || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || рік < 1940 || dob > сьогодні) ok.person_ok = false;
          for (const k of ['prizvushche', 'Name', 'po_batkovi', 'City']) if (person_after[k] && person_after[k].length > 100) ok.fields_ok = false;
          if (person_after.Growth != null && !(person_after.Growth >= 100 && person_after.Growth <= 230)) ok.fields_ok = false;
          if (person_after.Weight != null && !(person_after.Weight >= 30 && person_after.Weight <= 200)) ok.fields_ok = false;
          if (н.Photo && !(typeof н.Photo === 'object' && String(н.Photo.path || '').startsWith('/vault/'))) ok.fields_ok = false;
          for (const k of Object.keys(person_after)) if (person_after[k] == null) delete person_after[k];
          // Дубль: така сама особа вже є — її треба обрати в пошуку (ТЗ 2.2)
          if (($var.people || []).some((p) => норм(p.prizvushche) === норм(person_after.prizvushche) && String(p.Date_of_birth || '').slice(0, 10) === dob)) ok.dup_ok = false;
        } else ok.person_ok = false;

        // ——— Перехід: особа активна в іншому клубі, не з родини материнський/фарм ———
        const батько = new Map(($var.clubs || []).map((c) => [c.id, c.parent_teaminfo_id || null]));
        const родина = (a, b) => a === b || батько.get(a) === b || батько.get(b) === a || (батько.get(a) && батько.get(a) === батько.get(b));
        const чужий = people_id ? ($var.cards || []).find((k) => k.player_id === people_id && діюча(k) && !родина(k.teaminfo_id, клубId)) : null;

        // ——— Рядки складу ———
        const ліги = рядки.map((r) => Number(r && r.leagues_id));
        if (!рядки.length || new Set(ліги).size !== ліги.length) ok.rows_ok = false;
        const гравцівПозиції = new Set(($var.positions || []).filter((p) => p.Player_position === true).map((p) => p.id));
        const готові = рядки.map((r) => {
          const лігa = Number(r.leagues_id);
          const номер = Number(r.Number);
          const поз = Number(r.positions_id);
          if (!турнірКлубу.has(лігa)) ok.league_ok = false;
          else if (!вікноВідкрите(лігa)) ok.window_ok = false;
          if (!Number.isInteger(номер) || номер < 1 || номер > 99) ok.number_ok = false;
          // номер зайнятий: чинний гравець клубу в цьому турнірі або відкрита заявка (крім виведення)
          const зайнятий = ($var.cards || []).some((k) => k.teaminfo_id === клубId && k.leagues_id === лігa && діюча(k) && Number(k.Number) === номер && k.player_id !== people_id)
            || додаткові.some((д) => д.leagues_id === лігa && Number(д.Number) === номер && д.people_id !== people_id)
            || ($var.open || []).some((o) => o.leagues_id === лігa && o.action !== 'remove' && Number((o.after || {}).Number) === номер);
          if (зайнятий) ok.number_ok = false;
          if (!гравцівПозиції.has(поз)) ok.position_ok = false;
          // вже в складі цього турніру чи вже є відкрита заявка на цю особу й турнір
          if (people_id && (($var.cards || []).some((k) => k.teaminfo_id === клубId && k.leagues_id === лігa && k.player_id === people_id && діюча(k))
            || додаткові.some((д) => д.leagues_id === лігa && д.people_id === people_id)
            || ($var.open || []).some((o) => o.leagues_id === лігa && o.people_id === people_id && o.action !== 'remove'))) ok.already_ok = false;
          return {
            leagues_id: лігa,
            action: чужий ? 'transfer' : 'create',
            transfer_from_team_id: чужий ? чужий.id : null,
            transfer_from_teaminfo_id: чужий ? чужий.teaminfo_id : null,
            after: { Number: номер, positions_id: поз, Captain: !!r.Captain },
          };
        });
        return { ...ok, people_id, person_after, rows: готові };
      """
      timeout = 20
    } as $plan

    precondition ($plan.person_ok) {
      error_type = "badrequest"
      error = "Оберіть особу з пошуку або вкажіть прізвище, ім'я й дату народження нової"
    }
    precondition ($plan.dup_ok) {
      error_type = "badrequest"
      error = "Така особа вже є в базі — оберіть її в пошуку, щоб не створювати дубль"
    }
    precondition ($plan.fields_ok) {
      error_type = "badrequest"
      error = "Перевірте дані особи: зріст 100–230 см, вага 30–200 кг, фото — через форму"
    }
    precondition ($plan.rows_ok) {
      error_type = "badrequest"
      error = "Оберіть хоча б один турнір (кожен — один раз)"
    }
    precondition ($plan.league_ok) {
      error_type = "badrequest"
      error = "Заявити гравця можна лише в турнір поточного сезону, де бере участь клуб"
    }
    precondition ($plan.window_ok) {
      error_type = "badrequest"
      error = "Заявкове вікно цього турніру закрите — склад змінює лише АФУ"
    }
    precondition ($plan.number_ok) {
      error_type = "badrequest"
      error = "Номер — від 1 до 99 і не зайнятий у складі цього турніру"
    }
    precondition ($plan.position_ok) {
      error_type = "badrequest"
      error = "Оберіть позицію: воротар чи універсал"
    }
    precondition ($plan.already_ok) {
      error_type = "badrequest"
      error = "Цей гравець уже в складі турніру або на нього вже є заявка"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    var $person_request {
      value = null
    }
    // Нова особа — спершу її person.create; рядки складу посилаються на неї
    // (depends_on_id), застосовуються після неї (контракт 1.1 п. 2.4)
    conditional {
      if ($plan.person_after != null) {
        db.add change_request {
          data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "person", action: "create", after: $plan.person_after, status: "draft", club_comment: $input.club_comment}
        } as $created_person
        api.lambda {
          code = """
            return 'newperson:' + $var.created_person.id;
          """
          timeout = 10
        } as $person_key
        db.edit change_request {
          field_name = "id"
          field_value = $created_person.id
          data = {open_key: $person_key, target_key: $person_key}
        } as $keyed_person
        var.update $person_request {
          value = $keyed_person
        }
      }
    }

    api.lambda {
      code = """
        const клуб = $input.teaminfo_id;
        const нова = $var.person_request ? $var.person_request.id : null;
        return ($var.plan.rows || []).map((r) => {
          const ключ = 'squad:' + клуб + ':' + r.leagues_id + ':' + (нова ? 'new' + нова : $var.plan.people_id);
          return { ...r, people_id: $var.plan.people_id, depends_on_id: нова, key: ключ };
        });
      """
      timeout = 10
    } as $final_rows

    foreach ($final_rows) {
      each as $row {
        db.add change_request {
          data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "squad_row", action: $row.action, leagues_id: $row.leagues_id, people_id: $row.people_id, depends_on_id: $row.depends_on_id, transfer_from_team_id: $row.transfer_from_team_id, transfer_from_teaminfo_id: $row.transfer_from_teaminfo_id, after: $row.after, status: "draft", open_key: $row.key, target_key: $row.key, club_comment: $input.club_comment}
        } as $added_row
      }
    }
  }

  response = {person_request_id: $person_request.id, rows: $final_rows|count}
}
