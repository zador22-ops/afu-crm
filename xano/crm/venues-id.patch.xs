query "venues/{venues_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int venues_id filters=min:1
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
      error_type = "badrequest"
      error = "Назва арени порожня"
    }

    db.get Venues {
      field_name = "id"
      field_value = $input.venues_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Арену не знайдено"
    }

    db.edit Venues {
      field_name = "id"
      field_value = $input.venues_id
      data = {City: $input.City}
    } as $venue
  }

  response = $venue
}
