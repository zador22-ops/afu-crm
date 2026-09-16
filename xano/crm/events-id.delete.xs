query "events/{statistic_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int statistic_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 4, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Statistic {
      field_name = "id"
      field_value = $input.statistic_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Подію не знайдено"
    }

    db.del Statistic {
      field_name = "id"
      field_value = $input.statistic_id
    }

    // Знятий гол має одразу змінити і рахунок, і рядки таблиці.
    function.run "CRM table recalc" {
      input = {match_id: $was.match_id}
    } as $recalc
  }

  response = {deleted: 1, table: $recalc}
}
