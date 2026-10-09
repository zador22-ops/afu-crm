query "game-admin/fans/{fans_id}/nick-reset" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Скинути нік гравця: game_nick і game_nick_key — null, НІКОЛИ не "" (на ключі
  // унікальний індекс, два порожні рядки — уже дубль). Гравець обере новий.
  input {
    int fans_id filters=min:1
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
      output = ["id", "game_nick"]
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Гравця не знайдено"
    }

    db.edit "Users fans" {
      field_name = "id"
      field_value = $input.fans_id
      data = {game_nick: null, game_nick_key: null}
    } as $row
  }

  response = {fans_id: $input.fans_id, previous_nick: $was.game_nick, nick: null}
}
