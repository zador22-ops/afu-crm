query "club/clubs/{teaminfo_id}/submit" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // «Надіслати на погодження» (задача 2.2; ТЗ 3.2.2, контракт 1.1 п. 2.3–2.4):
  // усі чернетки клубу → submitted в одному пакеті change_batch. Знімок before
  // — на момент ПОДАЧІ: поля основного запису, які змінює заявка (для create —
  // null). Ліміт 1 пакет/год на клуб (ТЗ 6; відкликані не рахуються). Без
  // чернеток нічого не створюється (ТЗ 7.8). В основні таблиці — нічого.
  input {
    int teaminfo_id filters=min:1
    text title? filters=trim
    text club_comment? filters=trim
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

    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && $db.change_request.status == "draft"
      sort = {change_request.id: "asc"}
      return = {type: "list"}
      output = ["id", "entity", "action", "entity_id", "leagues_id", "after", "rev"]
    } as $drafts
    db.query change_batch {
      where = $db.change_batch.teaminfo_id == $input.teaminfo_id && $db.change_batch.status != "withdrawn"
      sort = {change_batch.submitted_at: "desc"}
      return = {type: "list"}
      output = ["id", "submitted_at"]
    } as $recent
    // Основні записи для знімка before (лише читання). Таблиці невеликі —
    // простіше прочитати й відібрати в лямбді, ніж робити запит на кожну заявку
    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $club
    db.query People {
      return = {type: "list"}
    } as $people
    db.query Team {
      where = $db.Team.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
    } as $squad
    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
    } as $staff
    // Додаткові турніри (варіант 3): before зміни номера чи виведення з
    // додаткового турніру — з team_league, а не з основного рядка Team
    db.query team_league {
      where = $db.team_league.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
    } as $extra

    api.lambda {
      code = """
        const ГОДИНА = 3600 * 1000;
        const останній = ($var.recent || [])[0];
        const таблиця = { club: () => [$var.club].filter(Boolean), person: () => $var.people || [], squad_row: () => $var.squad || [], staff_row: () => $var.staff || [] };
        const знімок = (r) => {
          if (r.action === 'create' || r.entity_id == null) return null;
          let рядок = (таблиця[r.entity] ? таблиця[r.entity]() : []).find((x) => x.id === r.entity_id);
          if (рядок && r.entity === 'squad_row' && r.leagues_id && r.leagues_id !== рядок.leagues_id) {
            рядок = ($var.extra || []).find((д) => д.team_id === r.entity_id && д.leagues_id === r.leagues_id);
          }
          if (!рядок) return null;
          const б = {};
          for (const k of Object.keys(r.after || {})) if (k in рядок) б[k] = рядок[k];
          return б;
        };
        return {
          has_drafts: ($var.drafts || []).length > 0,
          // Межі тексту (рецензія Backend 30.10): назва пакета й коментар клубу
          text_ok: String($input.title || '').length <= 200 && String($input.club_comment || '').length <= 1000,
          rate_ok: !останній || Date.now() - Number(останній.submitted_at) >= ГОДИНА,
          rows: ($var.drafts || []).map((r) => ({ id: r.id, before: знімок(r) })),
        };
      """
      timeout = 20
    } as $plan

    precondition ($plan.has_drafts) {
      error_type = "badrequest"
      error = "Немає змін для надсилання"
    }
    precondition ($plan.text_ok) {
      error_type = "badrequest"
      error = "Назва пакета — до 200 знаків, коментар — до 1000"
    }
    precondition ($plan.rate_ok) {
      error_type = "badrequest"
      error = "Пакет можна надсилати не частіше разу на годину"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    var $batch {
      value = null
    }
    // ——— Перехід «submit» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
    // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
    // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
    // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
    // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
    // прибирання своїх ключів у catch уже є.
    api.lambda {
      code = """
        // Замок на кожну чернетку (за зростанням id): паралельний submit тих самих рядків — 409
        const рев = new Map(($var.drafts || []).map((d) => [d.id, d.rev || 0]));
        const рядки = ($var.plan.rows || []).map((r) => ({ id: r.id, before: r.before, rev: (рев.get(r.id) || 0) + 1 })).sort((a, b) => a.id - b.id);
        return {
          keys: рядки.map((r) => ({ key: 'cr:' + r.id + ':' + (r.rev - 1), op: 'submit', request_id: r.id, batch_id: null })),
          rows: рядки,
        };
      """
      timeout = 5
    } as $tr_submit
    var $mine_submit {
      value = []
    }
    var $ok_submit {
      value = false
    }
    try_catch {
      try {
        // ТРАНЗАКЦІЯ ↓
        db.transaction {
          stack {
        // ТРАНЗАКЦІЯ ↑
            foreach ($tr_submit.keys) {
              each as $lk {
                db.add change_lock {
                  data = {created_at: "now", key: $lk.key, op: $lk.op, request_id: $lk.request_id, batch_id: $lk.batch_id, users_id: $acted_by, club_account_id: $auth.id}
                } as $lock_submit
                var.update $mine_submit {
                  value = $mine_submit|push:$lock_submit.id
                }
              }
            }
            db.add change_batch {
              data = {created_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, title: $input.title, status: "submitted", submitted_at: "now", has_decision: false, club_comment: $input.club_comment, rev: 0}
            } as $added_batch
            var.update $batch {
              value = $added_batch
            }
            foreach ($tr_submit.rows) {
              each as $row {
                db.edit change_request {
                  field_name = "id"
                  field_value = $row.id
                  data = {status: "submitted", batch_id: $added_batch.id, before: $row.before, updated_at: "now", rev: $row.rev}
                } as $submitted_row
              }
            }
        // ТРАНЗАКЦІЯ ↓
          }
        }
        // ТРАНЗАКЦІЯ ↑
        var.update $ok_submit {
          value = true
        }
      }
      catch {
        // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
        foreach ($mine_submit) {
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
    var $held_submit {
      value = []
    }
    conditional {
      if ($ok_submit == false) {
        foreach ($tr_submit.keys) {
          each as $hk {
            db.get change_lock {
              field_name = "key"
              field_value = $hk.key
              output = ["id", "op"]
            } as $h
            conditional {
              if ($h != null) {
                var.update $held_submit {
                  value = $held_submit|push:$hk.key
                }
              }
            }
          }
        }
      }
    }
    precondition ($ok_submit || ($held_submit|count) == 0) {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
    }
    precondition ($ok_submit) {
      error_type = "standard"
      error = "Помилка бази — нічого не змінено, спробуйте ще раз"
    }
  }

  response = {batch: {id: $batch.id, status: $batch.status, submitted_at: $batch.submitted_at}, rows: $tr_submit.rows|count}
}
