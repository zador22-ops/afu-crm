query "competitions/{league_id}/logo" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int league_id filters=min:1
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get league {
      field_name = "id"
      field_value = $input.league_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Змагання не знайдено"
    }

    // Один логотип на змагання (league.logo), не на сезон: Leagues.Logo лишається порожнім (рішення Р32)
    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img

    db.edit league {
      field_name = "id"
      field_value = $input.league_id
      data = {logo: $img}
    } as $item
  }

  response = $item
}
