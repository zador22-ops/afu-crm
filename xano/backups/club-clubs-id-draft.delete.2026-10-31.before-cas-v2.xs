// Клуб прибирає свою чернетку картки (задача 2.1). Лише draft — заявку на
// погодженні так не прибрати (для неї — відкликання пакета, 2.2); рядки,
// по яких є рішення, не видаляються ніколи (контракт 1.1, п. 2.4).
query "club/clubs/{teaminfo_id}/draft" verb=DELETE {
  api_group = "crm"
  auth = "club_account"

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
      code = "  return 'club:' + $input.teaminfo_id;"
      timeout = 10
    } as $key
  
    // db.get за унікальним open_key: на відсутньому рядку — null (рецензія
    // Backend 30.10; поведінку «single» на порожньому результаті не перевірено)
    db.get change_request {
      field_name = "open_key"
      field_value = $key
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
  
    // CAS одним SQL: видалити, лише якщо досі draft (submit міг випередити)
    db.direct_query {
      sql = "DELETE FROM x1_93 WHERE id = ? AND status = 'draft' RETURNING id;"
      response_type = "list"
      arg = $draft.id
    } as $gone
  
    precondition (($gone|count) > 0) {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
    }
  }

  response = {draft: null}
}