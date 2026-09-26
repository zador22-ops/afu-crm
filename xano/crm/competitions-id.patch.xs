query "competitions/{league_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int league_id filters=min:1
    text name? filters=trim
    text type? filters=trim
    text short_name? filters=trim
    int sort_order?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.type == null || $input.type == "ліга" || $input.type == "кубок" || $input.type == "міжнародне") {
      error_type = "badrequest"
      error = "Тип має бути «ліга», «кубок» або «міжнародне»"
    }

    db.get league {
      field_name = "id"
      field_value = $input.league_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Змагання не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch league {
      field_name = "id"
      field_value = $input.league_id
      data = `$input|pick:($raw|keys)|unset:"league_id"`
    } as $item
  }

  response = $item
}
