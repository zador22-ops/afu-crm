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
    // db.get за унікальним open_key: на відсутньому рядку — null (рецензія
    // Backend 30.10; поведінку «single» на порожньому результаті не перевірено)
    db.get change_request {
      field_name = "open_key"
      field_value = $key
      output = ["id", "status", "rev"]
    } as $draft
    precondition ($draft != null) {
      error_type = "notfound"
      error = "Чернетки картки немає"
    }
    precondition ($draft.status == "draft") {
      error_type = "badrequest"
      error = "Зміни вже на погодженні — їх можна відкликати разом із пакетом"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    // ——— Перехід «delete» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
    // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
    // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
    // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
    // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
    // прибирання своїх ключів у catch уже є.
    api.lambda {
      code = """
        const o = $var.draft;
        return { keys: [{ key: 'cr:' + o.id + ':' + (o.rev || 0), op: 'delete', request_id: o.id, batch_id: null }] };
      """
      timeout = 5
    } as $tr_delete
    var $mine_delete {
      value = []
    }
    var $ok_delete {
      value = false
    }
    try_catch {
      try {
        // ТРАНЗАКЦІЯ ↓
        db.transaction {
          stack {
        // ТРАНЗАКЦІЯ ↑
            foreach ($tr_delete.keys) {
              each as $lk {
                db.add change_lock {
                  data = {created_at: "now", key: $lk.key, op: $lk.op, request_id: $lk.request_id, batch_id: $lk.batch_id, users_id: $acted_by, club_account_id: $auth.id}
                } as $lock_delete
                var.update $mine_delete {
                  value = $mine_delete|push:$lk.key
                }
              }
            }
            db.del change_request {
              field_name = "id"
              field_value = $draft.id
            }
        // ТРАНЗАКЦІЯ ↓
          }
        }
        // ТРАНЗАКЦІЯ ↑
        var.update $ok_delete {
          value = true
        }
      }
      catch {
        // Запасний варіант 3.3: свої ключі геть (у транзакції їх уже відкочено — нічого не знайде)
        foreach ($mine_delete) {
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
    var $held_delete {
      value = []
    }
    conditional {
      if ($ok_delete == false) {
        foreach ($tr_delete.keys) {
          each as $hk {
            db.get change_lock {
              field_name = "key"
              field_value = $hk.key
              output = ["id", "op"]
            } as $h
            conditional {
              if ($h != null) {
                var.update $held_delete {
                  value = $held_delete|push:$hk.key
                }
              }
            }
          }
        }
      }
    }
    precondition ($ok_delete || ($held_delete|count) == 0) {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
    }
    precondition ($ok_delete) {
      error_type = "standard"
      error = "Помилка бази — нічого не змінено, спробуйте ще раз"
    }
  }

  response = {draft: null}
}
