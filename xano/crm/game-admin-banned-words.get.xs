query "game-admin/banned-words" verb=GET {
  api_group = "crm"
  auth = "Users"

  // Заборонені слова для ніків (game_banned_word): word у нижньому регістрі,
  // kind — substring (усередині ніку) або exact (нік цілком).
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

    db.query game_banned_word {
      sort = {game_banned_word.word: "asc"}
      return = {type: "list"}
      output = ["id", "word", "kind", "created_at"]
    } as $rows
  }

  response = $rows
}
