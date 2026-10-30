query "club/clubs/{teaminfo_id}/players/{team_id}/remove" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // Вивести гравця зі складу — чернетка squad_row.remove (задача 3.1; ТЗ 2.2,
  // 3.3): при погодженні рядок Team закривається (End_date,
  // Relevance_of_the_record = false), не видаляється — історія лишається.
  // Рядок має належати цьому клубу; заявкове вікно турніру — відкрите.
  // Варіант 3: leagues_id — з якого турніру вивести (основний чи додатковий
  // з team_league); без нього — основний. Що саме закриється, вирішує 4.2
  // (планВивестиЗТурніру). Одна відкрита зміна на гравця (ключ team:<id>).
  input {
    int teaminfo_id filters=min:1
    int team_id filters=min:1
    int leagues_id?
    text end_date filters=trim
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

    db.get Team {
      field_name = "id"
      field_value = $input.team_id
      output = ["id", "player_id", "teaminfo_id", "leagues_id", "Relevance_of_the_record", "End_date", "Date"]
    } as $card
    precondition ($card != null && $card.teaminfo_id == $input.teaminfo_id) {
      error_type = "notfound"
      error = "Гравця в складі клубу не знайдено"
    }
    db.query team_league {
      where = $db.team_league.team_id == $input.team_id
      return = {type: "list"}
      output = ["id", "leagues_id", "is_active", "End_date"]
    } as $extra
    db.query registration_window {
      return = {type: "list"}
      output = ["leagues_id", "starts_at", "ends_at"]
    } as $windows
    db.query registration_rule {
      return = {type: "list"}
      output = ["leagues_id", "window_only"]
    } as $rules
    api.lambda {
      code = """
        const зараз = Date.now();
        const сьогодні = new Date(зараз).toISOString().slice(0, 10);
        const k = $var.card;
        const дата = String($input.end_date || '').slice(0, 10);
        const ліга = $input.leagues_id ? Number($input.leagues_id) : k.leagues_id;
        const додатковий = ($var.extra || []).some((д) => д.leagues_id === ліга && д.is_active !== false && (!д.End_date || String(д.End_date) >= сьогодні));
        const лишеУВікні = ($var.rules || []).some((r) => r.leagues_id === ліга && r.window_only === true);
        return {
          active: k.Relevance_of_the_record !== false && (!k.End_date || String(k.End_date) >= сьогодні),
          league_ok: ліга === k.leagues_id || додатковий,
          leagues_id: ліга,
          window_ok: !лишеУВікні || ($var.windows || []).some((w) => w.leagues_id === ліга && Number(w.starts_at) <= зараз && зараз < Number(w.ends_at)),
          date_ok: /^\d{4}-\d{2}-\d{2}$/.test(дата) && (!k.Date || дата >= String(k.Date).slice(0, 10)),
          end_date: дата,
          key: 'team:' + k.id,
        };
      """
      timeout = 10
    } as $plan
    precondition ($plan.active) {
      error_type = "badrequest"
      error = "Гравця вже виведено зі складу"
    }
    precondition ($plan.league_ok) {
      error_type = "badrequest"
      error = "Гравець не заявлений клубом у цей турнір"
    }
    precondition ($plan.window_ok) {
      error_type = "badrequest"
      error = "Заявкове вікно цього турніру закрите — склад змінює лише АФУ"
    }
    precondition ($plan.date_ok) {
      error_type = "badrequest"
      error = "Дата виведення — не раніше дати заявки гравця"
    }
    db.get change_request {
      field_name = "open_key"
      field_value = $plan.key
      output = ["id"]
    } as $open
    precondition ($open == null) {
      error_type = "badrequest"
      error = "Для цього гравця вже є відкрита зміна — приберіть її або дочекайтесь рішення"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    db.add change_request {
      data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "squad_row", action: "remove", entity_id: $card.id, leagues_id: $plan.leagues_id, people_id: $card.player_id, after: {End_date: $plan.end_date}, status: "draft", open_key: $plan.key, target_key: $plan.key}
    } as $request
  }

  response = {request_id: $request.id}
}
