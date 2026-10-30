// Прибрати свою чернетку складу / особи / штабу (задача 3.1). Лише draft і
// лише свого клубу — CAS одним SQL. Нова особа (person.create) прибирається
// разом із рядками, що на неї посилаються; рядок складу нової особи — і
// сама особа, якщо інших рядків на неї не лишилось. x1_93 — change_request.
query "club/clubs/{teaminfo_id}/requests/{request_id}" verb=DELETE {
  api_group = "crm"
  auth = "club_account"

  input {
    int teaminfo_id filters=min:1
    int request_id filters=min:1
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
  
    db.get change_request {
      field_name = "id"
      field_value = $input.request_id
      output = ["id", "teaminfo_id", "status", "depends_on_id"]
    } as $request
  
    precondition ($request != null && $request.teaminfo_id == $input.teaminfo_id) {
      error_type = "notfound"
      error = "Чернетку не знайдено"
    }
  
    precondition ($request.status == "draft") {
      error_type = "badrequest"
      error = "Заявка вже на погодженні — її можна відкликати разом із пакетом"
    }
  
    // Сам рядок і все, що на нього посилається (рядки складу нової особи)
    db.direct_query {
      sql = "DELETE FROM x1_93 WHERE (id = ? OR depends_on_id = ?) AND teaminfo_id = ? AND status = 'draft' RETURNING id;"
      response_type = "list"
      arg = $input.request_id
      arg = $input.request_id
      arg = $input.teaminfo_id
    } as $gone
  
    precondition (($gone|count) > 0) {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
    }
  
    // Нова особа без жодного рядка складу — теж прибрати
    conditional {
      if ($request.depends_on_id != null) {
        db.direct_query {
          sql = """
            DELETE FROM x1_93 p WHERE p.id = ? AND p.teaminfo_id = ? AND p.status = 'draft'
              AND NOT EXISTS (SELECT 1 FROM x1_93 r WHERE r.depends_on_id = p.id) RETURNING id;
            """
          response_type = "list"
          arg = $request.depends_on_id
          arg = $input.teaminfo_id
        } as $orphan
      }
    }
  }

  response = {deleted: $gone|count}
}