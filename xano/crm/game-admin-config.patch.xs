query "game-admin/config" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // Вимикач гри (10.10): enabled = false — game/start віддає 403 game_maintenance,
  // game/me — game_available: false. Діє одразу, без деплою. Пише лише рядок #1.
  input {
    bool enabled
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get game_config {
      field_name = "id"
      field_value = 1
    } as $cfg
    precondition ($cfg != null) {
      error_type = "notfound"
      error = "Немає рядка вимикача game_config #1"
    }

    db.edit game_config {
      field_name = "id"
      field_value = 1
      data = {enabled: $input.enabled}
    } as $saved
  }

  response = {enabled: $saved.enabled}
}
