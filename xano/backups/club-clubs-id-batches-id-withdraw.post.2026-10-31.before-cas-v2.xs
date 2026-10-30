// Відкликати пакет (задача 2.2; ТЗ 3.2.2, контракт 1.1 п. 2.3): лише поки по
// ньому немає жодного рішення АФУ. Рядки → знову draft, batch_id і before
// — порожні (before зніметься заново при наступній подачі); пакет → withdrawn.
query "club/clubs/{teaminfo_id}/batches/{batch_id}/withdraw" verb=POST {
  api_group = "crm"
  auth = "club_account"

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
  
    // CAS одним SQL (рецензія Backend 30.10): пакет стає withdrawn, лише якщо
    // досі submitted і ЖОДЕН його рядок не має рішення — в тому самому
    // операторі. Інакше модератор міг би погодити й застосувати рядок між
    // перевіркою й записом, а відкликання повернуло б його в чернетку →
    // подвійне застосування. x1_92 — change_batch, x1_93 — change_request.
    // has_decision (контракт 4.2): погодження першим кроком ставить true на
    // рядку пакета, тож обидві дії серіалізуються на ньому; IS NOT TRUE — щоб
    // null (якщо десь не поставили false) не блокував відкликання.
    db.direct_query {
      sql = """
        UPDATE x1_92 SET status = 'withdrawn'
        WHERE id = ? AND teaminfo_id = ? AND status = 'submitted' AND has_decision IS NOT TRUE
          AND NOT EXISTS (SELECT 1 FROM x1_93 r WHERE r.batch_id = x1_92.id AND r.status <> 'submitted')
        RETURNING id;
        """
      response_type = "list"
      arg = $input.batch_id
      arg = $input.teaminfo_id
    } as $closed
  
    precondition (($closed|count) > 0) {
      error_type = "badrequest"
      error = "По пакету вже є рішення АФУ або він змінився — оновіть сторінку"
    }
  
    // Пакет уже не submitted, тож погодити його рядки модератор не зможе
    // (CAS погодження 4.2 перевіряє й статус пакета) — повертаємо їх у чернетки
    db.direct_query {
      sql = 'UPDATE x1_93 SET status = \'draft\', batch_id = NULL, "before" = NULL WHERE batch_id = ? AND status = \'submitted\' RETURNING id;'
      response_type = "list"
      arg = $input.batch_id
    } as $back
  
    db.edit change_batch {
      field_name = "id"
      field_value = $input.batch_id
      data = {withdrawn_at: "now"}
    } as $withdrawn
  }

  response = {
    batch: {id: $withdrawn.id, status: $withdrawn.status}
    rows : $back|count
  }
}