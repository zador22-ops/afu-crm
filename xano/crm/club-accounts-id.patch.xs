query "club-accounts/{club_account_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // Змінити акаунт клубу (задача 1.2): назву, вимкнути/увімкнути, новий
  // пароль, набір клубів. Право 22. Змінюється лише надіслане (за сирим
  // тілом). Клуби — повний новий набір: зайві прив'язки вимикаються (не
  // видаляються — історія заявок посилається на акаунт), нові додаються.
  input {
    int club_account_id filters=min:1
    text name? filters=trim
    bool is_active?
    text password?
    int[] teaminfo_ids?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 22, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get club_account {
      field_name = "id"
      field_value = $input.club_account_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Акаунт клубу не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.query club_account_club {
      return = {type: "list"}
      output = ["id", "club_account_id", "teaminfo_id", "is_active"]
    } as $links
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "parent_teaminfo_id"]
    } as $teams

    api.lambda {
      code = """
        const sent = new Set(Object.keys($var.raw || {}));
        const me = Number($input.club_account_id);
        const клуб = new Map(($var.teams || []).map((t) => [t.id, t]));
        const корінь = (id) => (клуб.get(id) && клуб.get(id).parent_teaminfo_id) || id;
        const мої = ($var.links || []).filter((l) => l.club_account_id === me);
        const чужіАктивні = new Set(($var.links || []).filter((l) => l.club_account_id !== me && l.is_active).map((l) => l.teaminfo_id));
        const clubs = sent.has('teaminfo_ids');
        const ids = clubs ? [...new Set(($input.teaminfo_ids || []).map(Number).filter((x) => x > 0))] : [];
        return {
          name: sent.has('name'),
          name_ok: !sent.has('name') || String($input.name || '').trim().length >= 2,
          active: sent.has('is_active'),
          password: sent.has('password'),
          password_ok: !sent.has('password') || String($input.password || '').length >= 8,
          clubs,
          ids_ok: !clubs || (ids.length > 0 && ids.every((id) => клуб.has(id))),
          family_ok: !clubs || new Set(ids.map(корінь)).size <= 1,
          clubs_free: !clubs || ids.every((id) => !чужіАктивні.has(id)),
          // Вимкнути: активні мої, яких немає в новому наборі
          off: clubs ? мої.filter((l) => l.is_active && !ids.includes(l.teaminfo_id)).map((l) => l.id) : [],
          // Увімкнути назад: мої вимкнені, що повернулись у набір
          on: clubs ? мої.filter((l) => !l.is_active && ids.includes(l.teaminfo_id)).map((l) => l.id) : [],
          // Додати: клуби, яких у мене ще не було зовсім
          add: clubs ? ids.filter((id) => !мої.some((l) => l.teaminfo_id === id)) : [],
        };
      """
      timeout = 10
    } as $plan

    precondition ($plan.name_ok) {
      error_type = "badrequest"
      error = "Вкажіть назву акаунта (щонайменше 2 символи)"
    }
    precondition ($plan.password_ok) {
      error_type = "badrequest"
      error = "Пароль — щонайменше 8 символів"
    }
    precondition ($plan.ids_ok) {
      error_type = "badrequest"
      error = "Оберіть клуб"
    }
    precondition ($plan.family_ok) {
      error_type = "badrequest"
      error = "Кілька клубів в одному акаунті — лише материнський клуб і його фарм-клуб"
    }
    precondition ($plan.clubs_free) {
      error_type = "badrequest"
      error = "У клубу вже є акаунт. Один акаунт на клуб — змініть наявний"
    }

    conditional {
      if ($plan.name) {
        db.edit club_account {
          field_name = "id"
          field_value = $input.club_account_id
          data = {name: $input.name}
        } as $e_name
      }
    }
    conditional {
      if ($plan.active) {
        db.edit club_account {
          field_name = "id"
          field_value = $input.club_account_id
          data = {is_active: $input.is_active}
        } as $e_active
      }
    }
    conditional {
      if ($plan.password) {
        db.edit club_account {
          field_name = "id"
          field_value = $input.club_account_id
          data = {password: $input.password}
        } as $e_password
      }
    }
    foreach ($plan.off) {
      each as $link_id {
        db.edit club_account_club {
          field_name = "id"
          field_value = $link_id
          data = {is_active: false}
        } as $e_off
      }
    }
    foreach ($plan.on) {
      each as $link_id {
        db.edit club_account_club {
          field_name = "id"
          field_value = $link_id
          data = {is_active: true}
        } as $e_on
      }
    }
    foreach ($plan.add) {
      each as $teaminfo_id {
        db.add club_account_club {
          data = {created_at: "now", club_account_id: $input.club_account_id, teaminfo_id: $teaminfo_id, is_active: true}
        } as $e_add
      }
    }

    db.get club_account {
      field_name = "id"
      field_value = $input.club_account_id
      output = ["id", "email", "name", "is_active", "last_login_at"]
    } as $account
  }

  response = $account
}
