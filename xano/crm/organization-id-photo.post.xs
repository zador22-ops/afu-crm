query "organization/{organization_match_id}/photo" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int organization_match_id filters=min:1
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 8, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get "Organization Match" {
      field_name = "id"
      field_value = $input.organization_match_id
    } as $item
    precondition ($item != null) {
      error_type = "notfound"
      error = "Пункт організації не знайдено"
    }

    // Фото прикріплюється до пункту, а не до матчу: так само в ADMIN, і саме
    // тому при видаленні матчу фото зносяться першими.
    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img

    db.add "Organization Match Photos" {
      data = {
        created_at            : "now"
        organization_match_id : $input.organization_match_id
        photo                 : $img
      }
    } as $photo
  }

  response = $photo
}
