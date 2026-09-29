query "governing-members/{member_id}/photo" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int member_id filters=min:1
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: __RIGHT_GOV__, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.get governing_member {
      field_name = "id"
      field_value = $input.member_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Члена складу не знайдено"
    }
    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img
    db.edit governing_member {
      field_name = "id"
      field_value = $input.member_id
      data = {photo: $img, updated_at: "now"}
    } as $item
  }

  response = $item
}
