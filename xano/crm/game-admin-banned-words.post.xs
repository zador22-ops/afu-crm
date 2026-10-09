query "game-admin/banned-words" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Додати заборонене слово. Порівняння в game/nick — за «скелетом» (регістр,
  // латиниця-двійники, розділювачі), тож варіанти на кшталт «х_у_й» окремо не
  // потрібні. Короткі слова, що сидять у чесних ніках, — exact.
  input {
    text word filters=trim|lower
    text kind?=substring filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    precondition ($input.word != "" && ($input.kind == "substring" || $input.kind == "exact")) {
      error_type = "badrequest"
      error = "Потрібне слово і вид: substring або exact"
    }

    db.query game_banned_word {
      where = $db.game_banned_word.word == $input.word
      return = {type: "count"}
    } as $dup
    precondition ($dup == 0) {
      error_type = "badrequest"
      error = "Це слово вже є в списку"
    }

    db.add game_banned_word {
      data = {created_at: "now", word: $input.word, kind: $input.kind}
    } as $row
  }

  response = $row
}
