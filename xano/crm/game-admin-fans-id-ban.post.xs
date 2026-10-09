query "game-admin/fans/{fans_id}/ban" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Заблокувати (true) або розблокувати (false) гравця в рейтингу: game_banned.
  // Його рядки не видаляються, але не потрапляють у таблиці й у переможці.
  input {
    int fans_id filters=min:1
    bool banned?=true
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get "Users fans" {
      field_name = "id"
      field_value = $input.fans_id
      output = ["id"]
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Гравця не знайдено"
    }

    db.edit "Users fans" {
      field_name = "id"
      field_value = $input.fans_id
      data = {game_banned: $input.banned}
    } as $row
  }

  response = {fans_id: $input.fans_id, banned: $input.banned}
}
