query "people/{people_id}/photo" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int people_id filters=min:1
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 6, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get People {
      field_name = "id"
      field_value = $input.people_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Особу не знайдено"
    }

    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img

    db.edit People {
      field_name = "id"
      field_value = $input.people_id
      data = {Photo: $img}
    } as $person
  }

  response = $person
}
