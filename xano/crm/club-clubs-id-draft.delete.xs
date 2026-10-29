query "club/clubs/{teaminfo_id}/draft" verb=DELETE {
  api_group = "crm"
  auth = "club_account"

  // Клуб прибирає свою чернетку картки (задача 2.1). Лише draft — заявку на
  // погодженні так не прибрати (для неї — відкликання пакета, 2.2); рядки,
  // по яких є рішення, не видаляються ніколи (контракт 1.1, п. 2.4).
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

    api.lambda {
      code = """
        return 'club:' + $input.teaminfo_id;
      """
      timeout = 10
    } as $key
    db.query change_request {
      where = $db.change_request.open_key == $key
      return = {type: "single"}
      output = ["id", "status"]
    } as $draft
    precondition ($draft != null) {
      error_type = "notfound"
      error = "Чернетки картки немає"
    }
    precondition ($draft.status == "draft") {
      error_type = "badrequest"
      error = "Зміни вже на погодженні — їх можна відкликати разом із пакетом"
    }

    db.del change_request {
      field_name = "id"
      field_value = $draft.id
    }
  }

  response = {draft: null}
}
