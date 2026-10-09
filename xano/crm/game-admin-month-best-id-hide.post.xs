query "game-admin/month-best/{game_month_best_id}/hide" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Сховати (hidden=true) або повернути (false) результат місяця. Рядок лишається:
  // рейтинг і закриття місяця читають hidden як «!= true».
  input {
    int game_month_best_id filters=min:1
    bool hidden?=true
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get game_month_best {
      field_name = "id"
      field_value = $input.game_month_best_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Результат не знайдено"
    }

    db.edit game_month_best {
      field_name = "id"
      field_value = $input.game_month_best_id
      data = {hidden: $input.hidden}
    } as $row
  }

  response = {id: $row.id, hidden: $row.hidden}
}
