query "judges/{judges_id}/photo" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int judges_id filters=min:1
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 7, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Judges {
      field_name = "id"
      field_value = $input.judges_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Суддю не знайдено"
    }

    // Колонка називається `photo` з малої — не `Photo`, як у People.
    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img

    db.edit Judges {
      field_name = "id"
      field_value = $input.judges_id
      data = {photo: $img}
    } as $judge
  }

  response = $judge
}
