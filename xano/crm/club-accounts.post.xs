query "club-accounts" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Створити акаунт представника клубу з прив'язкою до клубів (задача 1.2).
  // Право 22. Кілька клубів — лише материнський і фарм (рішення Андрія 8.2);
  // у кожного клубу — не більше одного активного акаунта (8.1). Пароль задає
  // АФУ, у базі він хешується (поле типу password), назад не віддається.
  input {
    text email filters=trim|lower
    text name filters=trim
    text password
    int[] teaminfo_ids
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
      field_name = "email"
      field_value = $input.email
    } as $same_email
    db.query club_account_club {
      where = $db.club_account_club.is_active == true
      return = {type: "list"}
      output = ["club_account_id", "teaminfo_id"]
    } as $links
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "parent_teaminfo_id"]
    } as $teams

    api.lambda {
      code = """
        const ids = [...new Set(($input.teaminfo_ids || []).map(Number).filter((x) => x > 0))];
        const клуб = new Map(($var.teams || []).map((t) => [t.id, t]));
        const зайняті = new Set(($var.links || []).map((l) => l.teaminfo_id));
        // Кілька клубів — лише родина «материнський + фарм»: усі мають спільний корінь
        const корінь = (id) => (клуб.get(id) && клуб.get(id).parent_teaminfo_id) || id;
        return {
          ids,
          email_ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String($input.email || '')),
          name_ok: String($input.name || '').trim().length >= 2,
          password_ok: String($input.password || '').length >= 8,
          ids_ok: ids.length > 0 && ids.every((id) => клуб.has(id)),
          family_ok: new Set(ids.map(корінь)).size <= 1,
          clubs_free: ids.every((id) => !зайняті.has(id)),
        };
      """
      timeout = 10
    } as $plan

    precondition ($plan.email_ok) {
      error_type = "badrequest"
      error = "Вкажіть правильну пошту"
    }
    precondition ($same_email == null) {
      error_type = "badrequest"
      error = "Акаунт з такою поштою вже є"
    }
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

    db.add club_account {
      data = {created_at: "now", email: $input.email, password: $input.password, name: $input.name, is_active: true, created_by_users_id: $auth.id}
    } as $account

    foreach ($plan.ids) {
      each as $teaminfo_id {
        db.add club_account_club {
          data = {created_at: "now", club_account_id: $account.id, teaminfo_id: $teaminfo_id, is_active: true}
        } as $link
      }
    }
  }

  response = {id: $account.id, email: $account.email, name: $account.name, is_active: $account.is_active, teaminfo_ids: $plan.ids}
}
