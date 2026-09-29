query "venues/{venues_id}/photo" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int venues_id filters=min:1
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 11, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Venues {
      field_name = "id"
      field_value = $input.venues_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Арену не знайдено"
    }

    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img
    db.edit Venues {
      field_name = "id"
      field_value = $input.venues_id
      data = {photo: $img}
    } as $venue
  }

  response = $venue
}
