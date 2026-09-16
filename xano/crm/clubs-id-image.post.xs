query "clubs/{teaminfo_id}/image" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int teaminfo_id filters=min:1
    text kind filters=trim
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 5, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.kind == "logo" || $input.kind == "photo") {
      error_type = "badrequest"
      error = "kind має бути logo або photo"
    }

    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }

    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img

    conditional {
      if ($input.kind == "logo") {
        db.edit TeamInfo {
          field_name = "id"
          field_value = $input.teaminfo_id
          data = {TeamLogo: $img}
        } as $club
      }
      else {
        db.edit TeamInfo {
          field_name = "id"
          field_value = $input.teaminfo_id
          data = {TeamPhoto: $img}
        } as $club
      }
    }
  }

  response = $club
}
