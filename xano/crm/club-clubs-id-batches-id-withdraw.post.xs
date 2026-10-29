query "club/clubs/{teaminfo_id}/batches/{batch_id}/withdraw" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // Відкликати пакет (задача 2.2; ТЗ 3.2.2, контракт 1.1 п. 2.3): лише поки по
  // ньому немає жодного рішення АФУ. Рядки → знову draft, batch_id і before
  // — порожні (before зніметься заново при наступній подачі); пакет → withdrawn.
  input {
    int teaminfo_id filters=min:1
    int batch_id filters=min:1
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

    db.get change_batch {
      field_name = "id"
      field_value = $input.batch_id
      output = ["id", "teaminfo_id", "status"]
    } as $batch
    precondition ($batch != null && $batch.teaminfo_id == $input.teaminfo_id) {
      error_type = "notfound"
      error = "Пакет не знайдено"
    }
    precondition ($batch.status == "submitted") {
      error_type = "badrequest"
      error = "Цей пакет уже не на погодженні"
    }
    db.query change_request {
      where = $db.change_request.batch_id == $input.batch_id
      return = {type: "list"}
      output = ["id", "status"]
    } as $rows
    api.lambda {
      code = """
        const рядки = $var.rows || [];
        return { undecided: рядки.every((r) => r.status === 'submitted'), ids: рядки.map((r) => r.id) };
      """
      timeout = 10
    } as $plan
    precondition ($plan.undecided) {
      error_type = "badrequest"
      error = "По пакету вже є рішення АФУ — відкликати його не можна"
    }

    foreach ($plan.ids) {
      each as $id {
        db.edit change_request {
          field_name = "id"
          field_value = $id
          data = {status: "draft", batch_id: null, before: null, updated_at: "now"}
        } as $back
      }
    }
    db.edit change_batch {
      field_name = "id"
      field_value = $input.batch_id
      data = {status: "withdrawn", withdrawn_at: "now"}
    } as $withdrawn
  }

  response = {batch: {id: $withdrawn.id, status: $withdrawn.status}, rows: $plan.ids|count}
}
