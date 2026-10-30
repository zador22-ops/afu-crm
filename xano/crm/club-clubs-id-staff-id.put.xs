query "club/clubs/{teaminfo_id}/staff/{staff_id}" verb=PUT {
  api_group = "crm"
  auth = "club_account"

  // Змінити людину штабу (задача 3.3; ТЗ 2.3). Форма цілком; в after — лише
  // змінене. Дві чернетки: person.update (ключ person:<people_id>) — ПІБ, дата
  // народження, місто, зріст, вага, фото; staff_row.update (ключ staff:<id>) —
  // лише посада (контракт 4.2). «Лише свої особи»: особа береться ЛИШЕ з
  // чинного рядка Administration of teams цього клубу; People — після цієї
  // перевірки. В основні таблиці — нічого.
  input {
    int teaminfo_id filters=min:1
    int staff_id filters=min:1
    // {prizvushche, Name, po_batkovi, Date_of_birth, City, Growth, Weight, Photo}
    json person?
    int positions_id?
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

    db.get "Administration of teams" {
      field_name = "id"
      field_value = $input.staff_id
      output = ["id", "people_id", "teaminfo_id", "positions_id", "Relevance_of_the_record", "end_date"]
    } as $row
    precondition ($row != null && $row.teaminfo_id == $input.teaminfo_id && $row.Relevance_of_the_record != false) {
      error_type = "accessdenied"
      error = "Ця людина не у вашому штабі"
    }
    // Лише тепер — дані особи (вона в чинному штабі цього клубу)
    db.get People {
      field_name = "id"
      field_value = $row.people_id
      output = ["id", "prizvushche", "Name", "po_batkovi", "Date_of_birth", "Photo", "City", "Growth", "Weight"]
    } as $person
    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id && $db.Administration_of_teams.people_id == $row.people_id && $db.Administration_of_teams.Relevance_of_the_record == true
      return = {type: "list"}
      output = ["id", "positions_id", "end_date"]
    } as $same_person
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Player_position"]
    } as $positions

    api.lambda {
      code = """
        const зараз = Date.now();
        const сьогодні = new Date(зараз).toISOString().slice(0, 10);
        const чинна = $var.person || {};
        const рядок = (v) => (v == null ? '' : String(v).trim());
        const шлях = (v) => (v && typeof v === 'object' ? String(v.path || '') : '');
        const r = $var.row;
        const ok = { person_fields_ok: true, name_ok: true, dob_ok: true, size_ok: true, photo_ok: true, text_ok: true, position_ok: true, dup_ok: true, comment_ok: true };

        // ——— Особа: лише змінене ———
        const ПОЛЯ_ОСОБИ = ['prizvushche', 'Name', 'po_batkovi', 'Date_of_birth', 'Photo', 'City', 'Growth', 'Weight'];
        const о = $input.person && typeof $input.person === 'object' && !Array.isArray($input.person) ? $input.person : null;
        const person_after = {};
        if (о) {
          for (const п of Object.keys(о)) if (!ПОЛЯ_ОСОБИ.includes(п)) ok.person_fields_ok = false;
          for (const п of ПОЛЯ_ОСОБИ) {
            if (!(п in о)) continue;
            const v = о[п];
            if (п === 'Photo') {
              if (v == null) continue; // прибрати фото не можна — лише замінити
              if (!шлях(v).startsWith('/vault/')) { ok.photo_ok = false; continue; }
              if (шлях(v) !== шлях(чинна.Photo)) person_after.Photo = v;
              continue;
            }
            if (п === 'Growth' || п === 'Weight') {
              if (рядок(v) === '') { if (чинна[п] != null) person_after[п] = null; continue; }
              const ч = Number(v);
              const [від, до] = п === 'Growth' ? [100, 230] : [30, 200];
              if (!Number.isFinite(ч) || ч < від || ч > до) { ok.size_ok = false; continue; }
              if (ч !== Number(чинна[п])) person_after[п] = ч;
              continue;
            }
            if (п === 'Date_of_birth') {
              const д = рядок(v).slice(0, 10);
              if (!/^\d{4}-\d{2}-\d{2}$/.test(д) || Number(д.slice(0, 4)) < 1940 || д > сьогодні) { ok.dob_ok = false; continue; }
              if (д !== String(чинна.Date_of_birth || '').slice(0, 10)) person_after.Date_of_birth = д;
              continue;
            }
            const t = рядок(v);
            if (t.length > 100) ok.text_ok = false;
            if ((п === 'prizvushche' || п === 'Name') && !t) ok.name_ok = false;
            if (t !== рядок(чинна[п])) person_after[п] = t || null;
          }
        }

        // ——— Посада штабу ———
        const staff_after = {};
        if ($input.positions_id) {
          const поз = Number($input.positions_id);
          if (!($var.positions || []).some((p) => p.id === поз && p.Player_position !== true)) ok.position_ok = false;
          else if (поз !== Number(r.positions_id)) {
            // та сама особа вже на цій посаді в клубі (інший рядок)
            if (($var.same_person || []).some((x) => x.id !== r.id && x.positions_id === поз && (!x.end_date || String(x.end_date) >= сьогодні))) ok.dup_ok = false;
            staff_after.positions_id = поз;
          }
        }
        ok.comment_ok = String($input.club_comment || '').length <= 1000;
        return {
          ...ok,
          person_after, person_empty: Object.keys(person_after).length === 0, person_key: 'person:' + r.people_id,
          staff_after, staff_empty: Object.keys(staff_after).length === 0, staff_key: 'staff:' + r.id,
        };
      """
      timeout = 10
    } as $plan

    precondition ($plan.person_fields_ok) {
      error_type = "badrequest"
      error = "Ці дані змінює лише АФУ"
    }
    precondition ($plan.name_ok) {
      error_type = "badrequest"
      error = "Прізвище та ім'я не можуть бути порожніми"
    }
    precondition ($plan.text_ok) {
      error_type = "badrequest"
      error = "Задовгий текст у полі (до 100 знаків)"
    }
    precondition ($plan.dob_ok) {
      error_type = "badrequest"
      error = "Перевірте дату народження"
    }
    precondition ($plan.size_ok) {
      error_type = "badrequest"
      error = "Зріст — 100–230 см, вага — 30–200 кг"
    }
    precondition ($plan.photo_ok) {
      error_type = "badrequest"
      error = "Фото спершу завантажте через форму"
    }
    precondition ($plan.position_ok) {
      error_type = "badrequest"
      error = "Оберіть посаду штабу"
    }
    precondition ($plan.dup_ok) {
      error_type = "badrequest"
      error = "Ця людина вже на цій посаді в клубі"
    }
    precondition ($plan.comment_ok) {
      error_type = "badrequest"
      error = "Коментар — до 1000 знаків"
    }

    // Відкриті заявки за ключами (db.get за унікальним open_key)
    db.get change_request {
      field_name = "open_key"
      field_value = $plan.person_key
      output = ["id", "status", "action", "rev"]
    } as $open_person
    // Булеві — у лямбді: чи обриває XanoScript «$x == null || $x.поле» на null,
    // не перевірено (рецензія Backend 30.10, жива перевірка 4а)
    api.lambda {
      code = """
        const o = $var.open_person;
        return !o || o.status === 'draft';
      """
      timeout = 5
    } as $person_open_ok
    precondition ($person_open_ok) {
      error_type = "badrequest"
      error = "Зміни даних особи вже на погодженні — дочекайтесь рішення АФУ або відкличте пакет"
    }
    db.get change_request {
      field_name = "open_key"
      field_value = $plan.staff_key
      output = ["id", "status", "action", "rev"]
    } as $open_staff
    // «Наша» відкрита чернетка посади — update. Виведення (той самий ключ) не чіпаємо
    api.lambda {
      code = """
        const o = $var.open_staff;
        return !!o && o.status === 'draft' && o.action === 'update';
      """
      timeout = 5
    } as $own_staff
    precondition ($plan.staff_empty || $open_staff == null || $own_staff) {
      error_type = "badrequest"
      error = "Для цієї людини вже є відкрита зміна штабу — приберіть її або дочекайтесь рішення АФУ"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    // ——— Чернетка person.update (person:<people_id>) — CAS v2: замок cr:<id>:<rev> і запис у транзакції ———
    conditional {
      if ($plan.person_empty && $open_person != null) {
        // ——— Перехід «del_person» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
        // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
        // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
        // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
        // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
        // прибирання своїх ключів у catch уже є.
        api.lambda {
          code = """
            const o = $var.open_person;
            return { keys: [{ key: 'cr:' + o.id + ':' + (o.rev || 0), op: 'delete', request_id: o.id, batch_id: null }], rev: (o.rev || 0) + 1 };
          """
          timeout = 5
        } as $tr_del_person
        var $mine_del_person {
          value = []
        }
        var $ok_del_person {
          value = false
        }
        try_catch {
          try {
            // ТРАНЗАКЦІЯ ↓
            db.transaction {
              stack {
            // ТРАНЗАКЦІЯ ↑
                foreach ($tr_del_person.keys) {
                  each as $lk {
                    db.add change_lock {
                      data = {created_at: "now", key: $lk.key, op: $lk.op, request_id: $lk.request_id, batch_id: $lk.batch_id, users_id: $acted_by, club_account_id: $auth.id}
                    } as $lock_del_person
                    var.update $mine_del_person {
                      value = $mine_del_person|push:$lock_del_person.id
                    }
                  }
                }
                db.del change_request {
                  field_name = "id"
                  field_value = $open_person.id
                }
            // ТРАНЗАКЦІЯ ↓
              }
            }
            // ТРАНЗАКЦІЯ ↑
            var.update $ok_del_person {
              value = true
            }
          }
          catch {
            // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
            foreach ($mine_del_person) {
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
        var $held_del_person {
          value = []
        }
        conditional {
          if ($ok_del_person == false) {
            foreach ($tr_del_person.keys) {
              each as $hk {
                db.get change_lock {
                  field_name = "key"
                  field_value = $hk.key
                  output = ["id", "op"]
                } as $h
                conditional {
                  if ($h != null) {
                    var.update $held_del_person {
                      value = $held_del_person|push:$hk.key
                    }
                  }
                }
              }
            }
          }
        }
        precondition ($ok_del_person || ($held_del_person|count) == 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
        precondition ($ok_del_person) {
          error_type = "standard"
          error = "Помилка бази — нічого не змінено, спробуйте ще раз"
        }
      }
    }
    conditional {
      if (!$plan.person_empty && $open_person == null) {
        db.add change_request {
          data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "person", action: "update", entity_id: $row.people_id, people_id: $row.people_id, after: $plan.person_after, status: "draft", open_key: $plan.person_key, target_key: $plan.person_key, club_comment: $input.club_comment, rev: 0}
        } as $added_person
      }
    }
    conditional {
      if (!$plan.person_empty && $open_person != null) {
        // ——— Перехід «edit_person» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
        // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
        // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
        // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
        // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
        // прибирання своїх ключів у catch уже є.
        api.lambda {
          code = """
            const o = $var.open_person;
            return { keys: [{ key: 'cr:' + o.id + ':' + (o.rev || 0), op: 'edit', request_id: o.id, batch_id: null }], rev: (o.rev || 0) + 1 };
          """
          timeout = 5
        } as $tr_edit_person
        var $mine_edit_person {
          value = []
        }
        var $ok_edit_person {
          value = false
        }
        try_catch {
          try {
            // ТРАНЗАКЦІЯ ↓
            db.transaction {
              stack {
            // ТРАНЗАКЦІЯ ↑
                foreach ($tr_edit_person.keys) {
                  each as $lk {
                    db.add change_lock {
                      data = {created_at: "now", key: $lk.key, op: $lk.op, request_id: $lk.request_id, batch_id: $lk.batch_id, users_id: $acted_by, club_account_id: $auth.id}
                    } as $lock_edit_person
                    var.update $mine_edit_person {
                      value = $mine_edit_person|push:$lock_edit_person.id
                    }
                  }
                }
                db.edit change_request {
                  field_name = "id"
                  field_value = $open_person.id
                  data = {after: $plan.person_after, updated_at: "now", club_account_id: $auth.id, acted_by_users_id: $acted_by, club_comment: $input.club_comment, rev: $tr_edit_person.rev}
                } as $edited_person
            // ТРАНЗАКЦІЯ ↓
              }
            }
            // ТРАНЗАКЦІЯ ↑
            var.update $ok_edit_person {
              value = true
            }
          }
          catch {
            // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
            foreach ($mine_edit_person) {
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
        var $held_edit_person {
          value = []
        }
        conditional {
          if ($ok_edit_person == false) {
            foreach ($tr_edit_person.keys) {
              each as $hk {
                db.get change_lock {
                  field_name = "key"
                  field_value = $hk.key
                  output = ["id", "op"]
                } as $h
                conditional {
                  if ($h != null) {
                    var.update $held_edit_person {
                      value = $held_edit_person|push:$hk.key
                    }
                  }
                }
              }
            }
          }
        }
        precondition ($ok_edit_person || ($held_edit_person|count) == 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
        precondition ($ok_edit_person) {
          error_type = "standard"
          error = "Помилка бази — нічого не змінено, спробуйте ще раз"
        }
      }
    }

    // ——— Чернетка staff_row.update (staff:<id>) — CAS v2 ———
    conditional {
      if ($plan.staff_empty && $own_staff) {
        // ——— Перехід «del_staff» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
        // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
        // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
        // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
        // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
        // прибирання своїх ключів у catch уже є.
        api.lambda {
          code = """
            const o = $var.open_staff;
            return { keys: [{ key: 'cr:' + o.id + ':' + (o.rev || 0), op: 'delete', request_id: o.id, batch_id: null }], rev: (o.rev || 0) + 1 };
          """
          timeout = 5
        } as $tr_del_staff
        var $mine_del_staff {
          value = []
        }
        var $ok_del_staff {
          value = false
        }
        try_catch {
          try {
            // ТРАНЗАКЦІЯ ↓
            db.transaction {
              stack {
            // ТРАНЗАКЦІЯ ↑
                foreach ($tr_del_staff.keys) {
                  each as $lk {
                    db.add change_lock {
                      data = {created_at: "now", key: $lk.key, op: $lk.op, request_id: $lk.request_id, batch_id: $lk.batch_id, users_id: $acted_by, club_account_id: $auth.id}
                    } as $lock_del_staff
                    var.update $mine_del_staff {
                      value = $mine_del_staff|push:$lock_del_staff.id
                    }
                  }
                }
                db.del change_request {
                  field_name = "id"
                  field_value = $open_staff.id
                }
            // ТРАНЗАКЦІЯ ↓
              }
            }
            // ТРАНЗАКЦІЯ ↑
            var.update $ok_del_staff {
              value = true
            }
          }
          catch {
            // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
            foreach ($mine_del_staff) {
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
        var $held_del_staff {
          value = []
        }
        conditional {
          if ($ok_del_staff == false) {
            foreach ($tr_del_staff.keys) {
              each as $hk {
                db.get change_lock {
                  field_name = "key"
                  field_value = $hk.key
                  output = ["id", "op"]
                } as $h
                conditional {
                  if ($h != null) {
                    var.update $held_del_staff {
                      value = $held_del_staff|push:$hk.key
                    }
                  }
                }
              }
            }
          }
        }
        precondition ($ok_del_staff || ($held_del_staff|count) == 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
        precondition ($ok_del_staff) {
          error_type = "standard"
          error = "Помилка бази — нічого не змінено, спробуйте ще раз"
        }
      }
    }
    conditional {
      if (!$plan.staff_empty && $open_staff == null) {
        db.add change_request {
          data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "staff_row", action: "update", entity_id: $row.id, people_id: $row.people_id, after: $plan.staff_after, status: "draft", open_key: $plan.staff_key, target_key: $plan.staff_key, club_comment: $input.club_comment, rev: 0}
        } as $added_staff
      }
    }
    conditional {
      if (!$plan.staff_empty && $own_staff) {
        // ——— Перехід «edit_staff» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
        // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
        // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
        // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
        // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
        // прибирання своїх ключів у catch уже є.
        api.lambda {
          code = """
            const o = $var.open_staff;
            return { keys: [{ key: 'cr:' + o.id + ':' + (o.rev || 0), op: 'edit', request_id: o.id, batch_id: null }], rev: (o.rev || 0) + 1 };
          """
          timeout = 5
        } as $tr_edit_staff
        var $mine_edit_staff {
          value = []
        }
        var $ok_edit_staff {
          value = false
        }
        try_catch {
          try {
            // ТРАНЗАКЦІЯ ↓
            db.transaction {
              stack {
            // ТРАНЗАКЦІЯ ↑
                foreach ($tr_edit_staff.keys) {
                  each as $lk {
                    db.add change_lock {
                      data = {created_at: "now", key: $lk.key, op: $lk.op, request_id: $lk.request_id, batch_id: $lk.batch_id, users_id: $acted_by, club_account_id: $auth.id}
                    } as $lock_edit_staff
                    var.update $mine_edit_staff {
                      value = $mine_edit_staff|push:$lock_edit_staff.id
                    }
                  }
                }
                db.edit change_request {
                  field_name = "id"
                  field_value = $open_staff.id
                  data = {after: $plan.staff_after, updated_at: "now", club_account_id: $auth.id, acted_by_users_id: $acted_by, club_comment: $input.club_comment, rev: $tr_edit_staff.rev}
                } as $edited_staff
            // ТРАНЗАКЦІЯ ↓
              }
            }
            // ТРАНЗАКЦІЯ ↑
            var.update $ok_edit_staff {
              value = true
            }
          }
          catch {
            // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
            foreach ($mine_edit_staff) {
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
        var $held_edit_staff {
          value = []
        }
        conditional {
          if ($ok_edit_staff == false) {
            foreach ($tr_edit_staff.keys) {
              each as $hk {
                db.get change_lock {
                  field_name = "key"
                  field_value = $hk.key
                  output = ["id", "op"]
                } as $h
                conditional {
                  if ($h != null) {
                    var.update $held_edit_staff {
                      value = $held_edit_staff|push:$hk.key
                    }
                  }
                }
              }
            }
          }
        }
        precondition ($ok_edit_staff || ($held_edit_staff|count) == 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
        precondition ($ok_edit_staff) {
          error_type = "standard"
          error = "Помилка бази — нічого не змінено, спробуйте ще раз"
        }
      }
    }
  }

  response = {person_after: $plan.person_after, staff_after: $plan.staff_after}
}
