query "game-admin/winners/{game_season_winner_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  // Зняти запис переможця місяця. Новий переможець НЕ обирається, якщо рядки
  // місяця вже прибрано (після 7 днів); у межах 7 днів для цього —
  // «Перевизначити переможця», яке ще й ховає результат накрутника.
  input {
    int game_season_winner_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get game_season_winner {
      field_name = "id"
      field_value = $input.game_season_winner_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Запис не знайдено"
    }

    db.del game_season_winner {
      field_name = "id"
      field_value = $input.game_season_winner_id
    }
  }

  response = {deleted: 1, month: $was.month}
}
