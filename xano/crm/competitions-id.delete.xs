query "competitions/{league_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  // Видалити можна лише змагання, на яке не посилається жоден турнір сезону
  // (`Leagues.league_id`). Інакше турніри лишились би без змагання: застосунок
  // втратив би в них тип, порядок у шторці й логотип, і мовчки.
  input {
    int league_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get league {
      field_name = "id"
      field_value = $input.league_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Змагання не знайдено"
    }

    db.query Leagues {
      where = $db.Leagues.league_id == $input.league_id
      return = {type: "list"}
      output = ["id", "League"]
    } as $used

    // Повідомлення з назвами турнірів — у JS: склеювання рядків і чисел
    // XanoScript-ом ненадійне (див. zones, 19.09)
    api.lambda {
      code = """
        const used = $var.used || [];
        if (used.length === 0) return { ok: true, message: '' };
        const names = used.map(t => `«${t.League || '#' + t.id}»`).join(', ');
        return { ok: false, message: `Змагання має турніри: ${names}. Спершу перепривʼяжіть або видаліть їх` };
      """
      timeout = 10
    } as $check

    precondition ($check.ok == true) {
      error_type = "badrequest"
      error = $check.message
    }

    db.del league {
      field_name = "id"
      field_value = $input.league_id
    }
  }

  response = {deleted: 1}
}
