query "game-admin/banned-words/{game_banned_word_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  // Прибрати слово зі списку. Уже прийняті ніки не перевіряються заднім числом.
  input {
    int game_banned_word_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get game_banned_word {
      field_name = "id"
      field_value = $input.game_banned_word_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Слово не знайдено"
    }

    db.del game_banned_word {
      field_name = "id"
      field_value = $input.game_banned_word_id
    }
  }

  response = {deleted: 1, word: $was.word}
}
