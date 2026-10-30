query "moderation/requests/{request_id}/reject" verb=POST {
  api_group = "crm"
  auth = "Users"

  // «Повернути» заявку клубу (4.1; контракт 4.2 розділ 0, п. 4). Право 21.
  // Коментар обов'язковий. В основні таблиці нічого не пишеться. CAS v2 (AFU
  // docs/xano/club-self-service-cas-v2.md): доля пакета batch:<id>:fate (перше
  // рішення проти відкликання), замок cr:<id>:<rev> рядка; в одній транзакції —
  // і наслідки: нова особа, чиї рядки остаточні й жоден не застосовано, —
  // rejected / failed; пакет без submitted / approved — closed.
  input {
    int request_id filters=min:1
    text comment filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get change_request {
      field_name = "id"
      field_value = $input.request_id
      output = ["id", "batch_id", "entity", "action", "status", "depends_on_id", "rev"]
    } as $row
    api.lambda {
      code = """
        const r = $var.row;
        const к = String($input.comment || '').trim();
        return {
          found: !!r && r.batch_id != null,
          // person.create окремо не вирішується — лише через рядки складу / штабу
          decidable: !!r && !(r.entity === 'person' && r.action === 'create'),
          comment_ok: к.length >= 3 && к.length <= 1000,
        };
      """
      timeout = 5
    } as $check
    precondition ($check.found) {
      error_type = "notfound"
      error = "Заявку не знайдено"
    }
    precondition ($check.decidable) {
      error_type = "badrequest"
      error = "Нову особу окремо не повертають — поверніть її рядки складу чи штабу"
    }
    precondition ($check.comment_ok) {
      error_type = "badrequest"
      error = "Напишіть клубу, чому повертаєте (3–1000 знаків)"
    }

    precondition ($row.status == "submitted") {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
    }
    // Доля пакета (CAS v2): перше рішення АФУ або відкликання клубом — виграє перший.
    // Спершу читаємо: відкликано → відмова; «decided» — рішення йде далі без нового ключа
    api.lambda {
      code = """
        return 'batch:' + $var.row.batch_id + ':fate';
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
        return !$var.fate || $var.fate.op === 'decided';
      """
      timeout = 5
    } as $fate_ok
    precondition ($fate_ok) {
      error_type = "badrequest"
      error = "Клуб відкликав цей пакет — оновіть сторінку"
    }
    db.get change_batch {
      field_name = "id"
      field_value = $row.batch_id
      output = ["id", "status", "has_decision", "rev"]
    } as $batch
    // Рядки пакета — для наслідків рішення (нова особа, закриття пакета)
    db.query change_request {
      where = $db.change_request.batch_id == $row.batch_id
      sort = {change_request.id: "asc"}
      return = {type: "list"}
      output = ["id", "entity", "action", "status", "depends_on_id", "rev"]
    } as $batch_rows

    // ——— Перехід «reject» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
    // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
    // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
    // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
    // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
    // прибирання своїх ключів у catch уже є.
    api.lambda {
      code = """
        const r = $var.row;
        const b = $var.batch || {};
        // Наслідки рішення для пакета — передбачення ДО транзакції, щоб замки були відомі наперед
        // (два одночасні рішення в одному пакеті, які цього не бачать, долагоджує GET moderation/batches):
        // нова особа, чиї рядки всі остаточні й жоден не застосовано, — rejected / failed;
        // пакет без рядків submitted / approved — closed.
        const ОСТАТОЧНІ = ['applied', 'rejected', 'failed'];
        const наслідки = (рядки, зміниВхід) => {
          const зміни = { ...зміниВхід };
          const стан = (r) => (r.id in зміни ? зміни[r.id] : r.status);
          const особи = [];
          for (const p of рядки.filter((r) => r.entity === 'person' && r.action === 'create' && стан(r) === 'submitted')) {
            const діти = рядки.filter((r) => r.depends_on_id === p.id);
            if (діти.length && діти.every((r) => ОСТАТОЧНІ.includes(стан(r))) && !діти.some((r) => стан(r) === 'applied')) {
              const s = діти.some((r) => стан(r) === 'failed') ? 'failed' : 'rejected';
              особи.push({ id: p.id, lock_rev: p.rev || 0, rev: (p.rev || 0) + 1, status: s });
              зміни[p.id] = s;
            }
          }
          return { persons: особи, close: рядки.length > 0 && !рядки.some((r) => ['submitted', 'approved'].includes(стан(r))) };
        };
        // Порядок замків: доля пакета, особа, далі cr: за зростанням id (однаковий у всіх — без взаємного очікування)
        const упорядкувати = (ключі) => [...ключі].sort((a, b) => (a.rank - b.rank) || ((a.request_id || 0) - (b.request_id || 0))).map(({ rank, ...k }) => k);

        const н = наслідки($var.batch_rows || [], { [r.id]: 'rejected' });
        const ключі = [];
        if (!$var.fate) ключі.push({ rank: 0, key: $var.fate_key, op: 'decided', request_id: r.id, batch_id: r.batch_id });
        ключі.push({ rank: 2, key: 'cr:' + r.id + ':' + (r.rev || 0), op: 'reject', request_id: r.id, batch_id: r.batch_id });
        for (const o of н.persons) ключі.push({ rank: 2, key: 'cr:' + o.id + ':' + o.lock_rev, op: 'final', request_id: o.id, batch_id: r.batch_id });
        return { keys: упорядкувати(ключі), rev: (r.rev || 0) + 1, persons: н.persons, close: н.close, batch_rev: (b.rev || 0) + 1 };
      """
      timeout = 5
    } as $tr_reject
    var $mine_reject {
      value = []
    }
    var $ok_reject {
      value = false
    }
    try_catch {
      try {
        // ТРАНЗАКЦІЯ ↓
        db.transaction {
          stack {
        // ТРАНЗАКЦІЯ ↑
            foreach ($tr_reject.keys) {
              each as $lk {
                db.add change_lock {
                  data = {created_at: "now", key: $lk.key, op: $lk.op, request_id: $lk.request_id, batch_id: $lk.batch_id, users_id: $auth.id, club_account_id: null}
                } as $lock_reject
                var.update $mine_reject {
                  value = $mine_reject|push:$lock_reject.id
                }
              }
            }
            db.edit change_request {
              field_name = "id"
              field_value = $input.request_id
              data = {status: "rejected", updated_at: "now", decided_at: "now", decision_users_id: $auth.id, decision_comment: $input.comment, open_key: null, rev: $tr_reject.rev}
            } as $decided

            foreach ($tr_reject.persons) {
              each as $fp {
                db.edit change_request {
                  field_name = "id"
                  field_value = $fp.id
                  data = {status: $fp.status, updated_at: "now", decided_at: "now", decision_users_id: $auth.id, decision_comment: "Жоден рядок складу чи штабу не застосовано", open_key: null, rev: $fp.rev}
                } as $person_final
              }
            }
            // has_decision — лише відображення (долю пакета вирішує ключ batch:<id>:fate)
            db.edit change_batch {
              field_name = "id"
              field_value = $row.batch_id
              data = {has_decision: true, rev: $tr_reject.batch_rev}
            } as $batch_decided
            conditional {
              if ($tr_reject.close) {
                db.edit change_batch {
                  field_name = "id"
                  field_value = $row.batch_id
                  data = {status: "closed", closed_at: "now"}
                } as $batch_closed
              }
            }
        // ТРАНЗАКЦІЯ ↓
          }
        }
        // ТРАНЗАКЦІЯ ↑
        var.update $ok_reject {
          value = true
        }
      }
      catch {
        // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
        foreach ($mine_reject) {
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
    var $held_reject {
      value = []
    }
    conditional {
      if ($ok_reject == false) {
        foreach ($tr_reject.keys) {
          each as $hk {
            db.get change_lock {
              field_name = "key"
              field_value = $hk.key
              output = ["id", "op"]
            } as $h
            conditional {
              if ($h != null) {
                var.update $held_reject {
                  value = $held_reject|push:$hk.key
                }
              }
            }
          }
        }
      }
    }
    // Лише доля пакета: паралельне ПЕРШЕ рішення по іншому рядку — цей рядок ніхто не чіпав
    api.lambda {
      code = """
        const h = $var.held_reject || [];
        return h.length > 0 && h.every((k) => k === $var.fate_key);
      """
      timeout = 5
    } as $retry_reject
    precondition ($ok_reject || $retry_reject == false) {
      error_type = "badrequest"
      error = "Інше рішення по цьому пакету саме записується — спробуйте ще раз"
    }
    precondition ($ok_reject || ($held_reject|count) == 0) {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
    }
    precondition ($ok_reject) {
      error_type = "standard"
      error = "Помилка бази — нічого не змінено, спробуйте ще раз"
    }
  }

  response = {request_id: $input.request_id, status: "rejected", batch_closed: $tr_reject.close}
}
