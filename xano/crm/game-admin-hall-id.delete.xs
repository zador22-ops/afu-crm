query "game-admin/hall/{game_hall_of_fame_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  // Зняти запис «Залу слави» сезону. Щогодинне закриття перерахує його з
  // переможців місяців цього сезону, якщо сезон уже закрито.
  input {
    int game_hall_of_fame_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get game_hall_of_fame {
      field_name = "id"
      field_value = $input.game_hall_of_fame_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Запис не знайдено"
    }

    db.del game_hall_of_fame {
      field_name = "id"
      field_value = $input.game_hall_of_fame_id
    }
  }

  response = {deleted: 1, season: $was.season}
}
