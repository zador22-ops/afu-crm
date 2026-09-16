query venues verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text City filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 11, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.City != "") {
      error_type = "input"
      error = "Назва арени порожня"
    }

    // Місто й об'єкт живуть одним рядком («м. Бровари, БФСК») — так само, як їх
    // показує застосунок у картці матчу. Розділяти поле тут не можна: на нього
    // дивиться ADMIN і фанатський застосунок.
    db.add Venues {
      data = {created_at: "now", City: $input.City}
    } as $venue
  }

  response = $venue
}
