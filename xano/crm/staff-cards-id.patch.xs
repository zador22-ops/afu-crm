query "staff-cards/{card_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int card_id filters=min:1
    int types_of_cards_id?
    int minute?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 4, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get "Statistic Administration of teams" {
      field_name = "id"
      field_value = $input.card_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Картку не знайдено"
    }

    // Правка картки пуша не шле: сповіщення вже пішло при її появі, а
    // виправлення хвилини не подія для вболівальника.
    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch "Statistic Administration of teams" {
      field_name = "id"
      field_value = $input.card_id
      data = `$input|pick:($raw|keys)|unset:"card_id"`
    } as $card
  }

  response = $card
}
