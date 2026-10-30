query "club/clubs/{teaminfo_id}/staff/{staff_id}/remove" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // Вивести людину зі штабу — чернетка staff_row.remove (задача 3.3; контракт
  // 4.2): при погодженні рядок Administration of teams закривається
  // (end_date, Relevance_of_the_record = false), історія лишається. Рядок має
  // належати цьому клубу й бути чинним; дата — не в майбутньому й не раніше
  // за Date. Одна відкрита зміна на рядок (ключ staff:<id>).
  input {
    int teaminfo_id filters=min:1
    int staff_id filters=min:1
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

    db.get "Administration of teams" {
      field_name = "id"
      field_value = $input.staff_id
      output = ["id", "people_id", "teaminfo_id", "positions_id", "Relevance_of_the_record", "end_date", "Date"]
    } as $row
    precondition ($row != null && $row.teaminfo_id == $input.teaminfo_id) {
      error_type = "notfound"
      error = "Людину в штабі клубу не знайдено"
    }
    api.lambda {
      code = """
        const сьогодні = new Date(Date.now()).toISOString().slice(0, 10);
        const r = $var.row;
        const дата = String($input.end_date || '').slice(0, 10);
        return {
          active: r.Relevance_of_the_record !== false && (!r.end_date || String(r.end_date) >= сьогодні),
          date_ok: /^\d{4}-\d{2}-\d{2}$/.test(дата) && дата <= сьогодні && (!r.Date || дата >= String(r.Date).slice(0, 10)),
          end_date: дата,
          key: 'staff:' + r.id,
        };
      """
      timeout = 10
    } as $plan
    precondition ($plan.active) {
      error_type = "badrequest"
      error = "Цю людину вже виведено зі штабу"
    }
    precondition ($plan.date_ok) {
      error_type = "badrequest"
      error = "Дата виведення — не в майбутньому й не раніше дати призначення"
    }
    db.get change_request {
      field_name = "open_key"
      field_value = $plan.key
      output = ["id"]
    } as $open
    precondition ($open == null) {
      error_type = "badrequest"
      error = "Для цієї людини вже є відкрита зміна — приберіть її або дочекайтесь рішення АФУ"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    db.add change_request {
      data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "staff_row", action: "remove", entity_id: $row.id, people_id: $row.people_id, after: {end_date: $plan.end_date}, status: "draft", open_key: $plan.key, target_key: $plan.key}
    } as $request
  }

  response = {request_id: $request.id}
}
