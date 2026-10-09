query "game-admin/reports/{game_report_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  // «Розглянуто» = видалити рядок скарги (game-api.md). Той самий вболівальник
  // зможе поскаржитись на того самого знову.
  input {
    int game_report_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get game_report {
      field_name = "id"
      field_value = $input.game_report_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Скаргу не знайдено"
    }

    db.del game_report {
      field_name = "id"
      field_value = $input.game_report_id
    }
  }

  response = {deleted: 1}
}
