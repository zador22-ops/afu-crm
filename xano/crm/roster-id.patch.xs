query "roster/{team_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int team_id filters=min:1
    int Number?
    int positions_id?
    bool Captain?
    date Date?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 5, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Team {
      field_name = "id"
      field_value = $input.team_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Запис складу не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch Team {
      field_name = "id"
      field_value = $input.team_id
      data = `$input|pick:($raw|keys)|unset:"team_id"`
    } as $row
  }

  response = $row
}
