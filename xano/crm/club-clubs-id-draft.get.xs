query "club/clubs/{teaminfo_id}/draft" verb=GET {
  api_group = "crm"
  auth = "club_account"

  // Відкрита заявка на зміну картки клубу (чернетка чи на погодженні; задача
  // 2.1). Одна на клуб: open_key «club:<id>» (контракт 1.1, п. 3). null — немає.
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
      output = ["id", "status", "after", "club_comment", "batch_id", "updated_at", "created_at", "acted_by_users_id"]
    } as $draft
  }

  response = {draft: $draft}
}
