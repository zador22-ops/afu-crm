query "game-admin/config" verb=GET {
  api_group = "crm"
  auth = "Users"

  // Вимикач гри (10.10): стан рядка game_config #1 — того самого, що читають
  // game/start і game/me у застосунку. Немає рядка — гра працює.
  input {
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

    api.lambda {
      code = "return { enabled: !($var.cfg && $var.cfg.enabled === false) };"
      timeout = 10
    } as $out
  }

  response = $out
}
