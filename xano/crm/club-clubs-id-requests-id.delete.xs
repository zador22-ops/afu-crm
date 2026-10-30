query "club/clubs/{teaminfo_id}/requests/{request_id}" verb=DELETE {
  api_group = "crm"
  auth = "club_account"

  // Прибрати свою чернетку складу / особи / штабу (задача 3.1). Лише draft і
  // лише свого клубу. Нова особа (person.create) прибирається разом із рядками,
  // що на неї посилаються; рядок складу нової особи — і сама особа, якщо інших
  // рядків на неї не лишилось. CAS v2: замок cr:<id>:<rev> на кожен рядок,
  // видалення — однією транзакцією (або всі, або жоден).
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

    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id", "status", "depends_on_id", "rev"]
    } as $club_rows
    // Що видаляємо: сам рядок + рядки, що на нього посилаються (рядки складу нової
    // особи) + нова особа, якщо на неї більше нічого не посилається
    api.lambda {
      code = """
        const id = Number($input.request_id);
        const усі = $var.club_rows || [];
        const цілі = усі.filter((r) => r.id === id || r.depends_on_id === id);
        const батько = $var.request.depends_on_id;
        if (батько) {
          const інші = усі.filter((r) => r.depends_on_id === батько && !цілі.some((ц) => ц.id === r.id));
          const б = усі.find((r) => r.id === батько);
          if (!інші.length && б && б.status === 'draft') цілі.push(б);
        }
        return { targets: цілі.sort((a, b) => a.id - b.id), all_draft: цілі.every((r) => r.status === 'draft') };
      """
      timeout = 5
    } as $plan
    precondition ($plan.all_draft) {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
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
        return { keys: ($var.plan.targets || []).map((r) => ({ key: 'cr:' + r.id + ':' + (r.rev || 0), op: 'delete', request_id: r.id, batch_id: null })) };
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
                  value = $mine_delete|push:$lock_delete.id
                }
              }
            }
            foreach ($plan.targets) {
              each as $t {
                db.del change_request {
                  field_name = "id"
                  field_value = $t.id
                }
              }
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
        // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
        foreach ($mine_delete) {
          each as $mk {
            try_catch {
              try {
                db.del change_lock {
                  field_name = "id"
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

  response = {deleted: $plan.targets|count}
}
