query "matches/{match_id}/recalc" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 2, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Match {
      field_name = "id"
      field_value = $input.match_id
    } as $match
    precondition ($match != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }

    // Ручний перерахунок: приводить рахунок і рядки таблиці одного матчу до
    // подій. Потрібен для лагодження того, що лишила стара логіка ADMIN, і як
    // страховка, якщо матч правили в ADMIN повз CRM.
    function.run "CRM table recalc" {
      input = {match_id: $input.match_id}
    } as $recalc
  }

  response = $recalc
}
