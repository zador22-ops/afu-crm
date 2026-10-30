query "club/clubs/{teaminfo_id}/staff" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // Додати людину до штабу — чернетки заявок (задача 3.3; ТЗ 2.3, контракт
  // 4.2 staff_row.create). Особа — наявна (people_id з пошуку) або нова
  // (person.create, як у складі). Посада — лише штабу (не ігрова); та сама
  // особа на тій самій посаді клубу — відмова. Без заявкових вікон. В основні
  // таблиці — нічого (лише change_request).
  input {
    int teaminfo_id filters=min:1
    // {people_id} або {new: {prizvushche, Name, po_batkovi?, Date_of_birth, Photo?, City?, Growth?, Weight?}}
    json person
    int positions_id filters=min:1
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

    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id && $db.Administration_of_teams.Relevance_of_the_record == true
      return = {type: "list"}
      output = ["id", "people_id", "positions_id", "end_date"]
    } as $rows
    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Date_of_birth"]
    } as $people
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Player_position"]
    } as $positions
    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && ($db.change_request.status == "draft" || $db.change_request.status == "submitted") && $db.change_request.entity == "staff_row"
      return = {type: "list"}
      output = ["id", "action", "people_id", "after"]
    } as $open

    api.lambda {
      code = """
        const зараз = Date.now();
        const сьогодні = new Date(зараз).toISOString().slice(0, 10);
        const норм = (s) => String(s || '').trim().toLowerCase();
        const текст = (v, max) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max + 1));
        const особа = $input.person && typeof $input.person === 'object' ? $input.person : {};
        const поз = Number($input.positions_id);
        const ok = { person_ok: true, dup_ok: true, fields_ok: true, position_ok: true, already_ok: true, comment_ok: true };

        // ——— Особа ———
        let people_id = null;
        let person_after = null;
        if (особа.people_id) {
          people_id = Number(особа.people_id);
          if (!($var.people || []).some((p) => p.id === people_id)) ok.person_ok = false;
        } else if (особа.new && typeof особа.new === 'object') {
          const н = особа.new;
          const dob = String(н.Date_of_birth || '').slice(0, 10);
          person_after = {
            prizvushche: текст(н.prizvushche, 100), Name: текст(н.Name, 100), po_batkovi: текст(н.po_batkovi, 100),
            Date_of_birth: dob, City: текст(н.City, 100),
            Growth: н.Growth == null || н.Growth === '' ? null : Number(н.Growth),
            Weight: н.Weight == null || н.Weight === '' ? null : Number(н.Weight),
          };
          if (н.Photo) person_after.Photo = н.Photo;
          const рік = Number(dob.slice(0, 4));
          if (!person_after.prizvushche || !person_after.Name || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || рік < 1940 || dob > сьогодні) ok.person_ok = false;
          for (const k of ['prizvushche', 'Name', 'po_batkovi', 'City']) if (person_after[k] && person_after[k].length > 100) ok.fields_ok = false;
          if (person_after.Growth != null && !(person_after.Growth >= 100 && person_after.Growth <= 230)) ok.fields_ok = false;
          if (person_after.Weight != null && !(person_after.Weight >= 30 && person_after.Weight <= 200)) ok.fields_ok = false;
          if (н.Photo && !(typeof н.Photo === 'object' && String(н.Photo.path || '').startsWith('/vault/'))) ok.fields_ok = false;
          for (const k of Object.keys(person_after)) if (person_after[k] == null) delete person_after[k];
          // Дубль: така сама особа вже є — її треба обрати в пошуку (ТЗ 2.2)
          if (($var.people || []).some((p) => норм(p.prizvushche) === норм(person_after.prizvushche) && String(p.Date_of_birth || '').slice(0, 10) === dob)) ok.dup_ok = false;
        } else ok.person_ok = false;

        // Посада — лише штабу (контракт 4.2: «Оберіть посаду штабу»)
        if (!($var.positions || []).some((p) => p.id === поз && p.Player_position !== true)) ok.position_ok = false;
        // Та сама особа вже на цій посаді чи вже є заявка на неї
        if (people_id && (($var.rows || []).some((r) => r.people_id === people_id && r.positions_id === поз && (!r.end_date || String(r.end_date) >= сьогодні))
          || ($var.open || []).some((o) => o.action === 'create' && o.people_id === people_id && Number((o.after || {}).positions_id) === поз))) ok.already_ok = false;
        ok.comment_ok = String($input.club_comment || '').length <= 1000;
        return { ...ok, people_id, person_after, after: { positions_id: поз } };
      """
      timeout = 20
    } as $plan

    precondition ($plan.person_ok) {
      error_type = "badrequest"
      error = "Оберіть особу з пошуку або вкажіть прізвище, ім'я й дату народження нової"
    }
    precondition ($plan.dup_ok) {
      error_type = "badrequest"
      error = "Така особа вже є в базі — оберіть її в пошуку, щоб не створювати дубль"
    }
    precondition ($plan.fields_ok) {
      error_type = "badrequest"
      error = "Перевірте дані особи: зріст 100–230 см, вага 30–200 кг, фото — через форму"
    }
    precondition ($plan.position_ok) {
      error_type = "badrequest"
      error = "Оберіть посаду штабу"
    }
    precondition ($plan.already_ok) {
      error_type = "badrequest"
      error = "Ця особа вже на цій посаді в клубі або на неї вже є заявка"
    }
    precondition ($plan.comment_ok) {
      error_type = "badrequest"
      error = "Коментар — до 1000 знаків"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    var $person_request {
      value = null
    }
    // Нова особа — спершу її person.create; рядки складу посилаються на неї
    // (depends_on_id), застосовуються після неї (контракт 1.1 п. 2.4)
    conditional {
      if ($plan.person_after != null) {
        db.add change_request {
          data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "person", action: "create", after: $plan.person_after, status: "draft", club_comment: $input.club_comment}
        } as $created_person
        api.lambda {
          code = """
            return 'newperson:' + $var.created_person.id;
          """
          timeout = 10
        } as $person_key
        db.edit change_request {
          field_name = "id"
          field_value = $created_person.id
          data = {open_key: $person_key, target_key: $person_key}
        } as $keyed_person
        var.update $person_request {
          value = $keyed_person
        }
      }
    }

    api.lambda {
      code = """
        // $person_request може бути null — поле читаємо тут, не у виразі XanoScript
        const нова = $var.person_request ? $var.person_request.id : null;
        return { key: 'staffnew:' + $input.teaminfo_id + ':' + (нова ? 'new' + нова : $var.plan.people_id) + ':' + $input.positions_id, depends_on_id: нова };
      """
      timeout = 10
    } as $made
    db.add change_request {
      data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "staff_row", action: "create", people_id: $plan.people_id, depends_on_id: $made.depends_on_id, after: $plan.after, status: "draft", open_key: $made.key, target_key: $made.key, club_comment: $input.club_comment}
    } as $request
  }

  response = {request_id: $request.id, person_request_id: $made.depends_on_id}
}
