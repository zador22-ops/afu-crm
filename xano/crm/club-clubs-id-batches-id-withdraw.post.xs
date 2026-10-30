query "club/clubs/{teaminfo_id}/batches/{batch_id}/withdraw" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // Відкликати пакет (задача 2.2; ТЗ 3.2.2, контракт 1.1 п. 2.3): лише поки по
  // ньому немає жодного рішення АФУ. Рядки → знову draft, batch_id і before
  // — порожні (before зніметься заново при наступній подачі); пакет → withdrawn.
  // CAS v2: «доля пакета» batch:<id>:fate (перше рішення АФУ або відкликання —
  // виграє перший) + cr:<id>:<rev> кожного рядка, усе в одній транзакції.
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
      output = ["id", "teaminfo_id", "status", "has_decision", "rev"]
    } as $batch
    precondition ($batch != null && $batch.teaminfo_id == $input.teaminfo_id) {
      error_type = "notfound"
      error = "Пакет не знайдено"
    }
    precondition ($batch.status == "submitted") {
      error_type = "badrequest"
      error = "Цей пакет уже не на погодженні"
    }
    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    db.query change_request {
      where = $db.change_request.batch_id == $input.batch_id
      sort = {change_request.id: "asc"}
      return = {type: "list"}
      output = ["id", "status", "rev"]
    } as $rows
    // Доля пакета — спершу читаємо: уже є рішення АФУ чи відкликано → відмова
    api.lambda {
      code = """
        return 'batch:' + $input.batch_id + ':fate';
      """
      timeout = 5
    } as $fate_key
    db.get change_lock {
      field_name = "key"
      field_value = $fate_key
      output = ["id", "op"]
    } as $fate
    api.lambda {
      code = """
        const f = $var.fate;
        return {
          fate_ok: !f,
          // жоден рядок ще не має рішення (has_decision — лише відображення, вирішує ключ)
          rows_ok: ($var.rows || []).length > 0 && ($var.rows || []).every((r) => r.status === 'submitted') && $var.batch.has_decision !== true,
        };
      """
      timeout = 5
    } as $check
    precondition ($check.fate_ok && $check.rows_ok) {
      error_type = "badrequest"
      error = "По пакету вже є рішення АФУ — відкликати не можна"
    }

    // ——— Перехід «withdraw» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
    // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
    // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
    // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
    // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
    // прибирання своїх ключів у catch уже є.
    api.lambda {
      code = """
        const b = $var.batch;
        const рядки = ($var.rows || []).map((r) => ({ id: r.id, rev: (r.rev || 0) + 1 })).sort((a, c) => a.id - c.id);
        return {
          keys: [{ key: $var.fate_key, op: 'withdrawn', request_id: null, batch_id: b.id }]
            .concat(рядки.map((r) => ({ key: 'cr:' + r.id + ':' + (r.rev - 1), op: 'withdraw', request_id: r.id, batch_id: b.id }))),
          rows: рядки,
          batch_rev: (b.rev || 0) + 1,
        };
      """
      timeout = 5
    } as $tr_withdraw
    var $mine_withdraw {
      value = []
    }
    var $ok_withdraw {
      value = false
    }
    try_catch {
      try {
        // ТРАНЗАКЦІЯ ↓
        db.transaction {
          stack {
        // ТРАНЗАКЦІЯ ↑
            foreach ($tr_withdraw.keys) {
              each as $lk {
                db.add change_lock {
                  data = {created_at: "now", key: $lk.key, op: $lk.op, request_id: $lk.request_id, batch_id: $lk.batch_id, users_id: $acted_by, club_account_id: $auth.id}
                } as $lock_withdraw
                var.update $mine_withdraw {
                  value = $mine_withdraw|push:$lk.key
                }
              }
            }
            db.edit change_batch {
              field_name = "id"
              field_value = $input.batch_id
              data = {status: "withdrawn", withdrawn_at: "now", rev: $tr_withdraw.batch_rev}
            } as $withdrawn_batch
            foreach ($tr_withdraw.rows) {
              each as $row {
                db.edit change_request {
                  field_name = "id"
                  field_value = $row.id
                  data = {status: "draft", batch_id: null, before: null, updated_at: "now", rev: $row.rev}
                } as $back_row
              }
            }
        // ТРАНЗАКЦІЯ ↓
          }
        }
        // ТРАНЗАКЦІЯ ↑
        var.update $ok_withdraw {
          value = true
        }
      }
      catch {
        // Запасний варіант 3.3: свої ключі геть (у транзакції їх уже відкочено — нічого не знайде)
        foreach ($mine_withdraw) {
          each as $mk {
            try_catch {
              try {
                db.del change_lock {
                  field_name = "key"
                  field_value = $mk
                }
              }
              catch {
              }
            }
          }
        }
      }
    }
    var $held_withdraw {
      value = []
    }
    conditional {
      if ($ok_withdraw == false) {
        foreach ($tr_withdraw.keys) {
          each as $hk {
            db.get change_lock {
              field_name = "key"
              field_value = $hk.key
              output = ["id", "op"]
            } as $h
            conditional {
              if ($h != null) {
                var.update $held_withdraw {
                  value = $held_withdraw|push:$hk.key
                }
              }
            }
          }
        }
      }
    }
    precondition ($ok_withdraw || ($held_withdraw|count) == 0) {
      error_type = "badrequest"
      error = "По пакету вже є рішення АФУ або він змінився — оновіть сторінку"
    }
    precondition ($ok_withdraw) {
      error_type = "standard"
      error = "Помилка бази — нічого не змінено, спробуйте ще раз"
    }
  }

  response = {batch: {id: $input.batch_id, status: "withdrawn"}, rows: $tr_withdraw.rows|count}
}
