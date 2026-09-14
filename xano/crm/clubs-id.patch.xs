query "clubs/{teaminfo_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int teaminfo_id filters=min:1
    text TeamName? filters=trim
    text TeamInfo? filters=trim
    bool Relevance?
    int leagues_id?
    int parent_teaminfo_id?
    int founded_year?
    int home_venues_id?
    text website? filters=trim
    text instagram? filters=trim
    text facebook? filters=trim
    text youtube? filters=trim
    text colors? filters=trim
    text contact_name? filters=trim
    text contact_phone? filters=trim
    text contact_email? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 5, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.parent_teaminfo_id != $input.teaminfo_id) {
      error_type = "input"
      error = "Клуб не може бути материнським для самого себе"
    }

    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
      data = `$input|pick:($raw|keys)|unset:"teaminfo_id"`
    } as $club
  }

  response = $club
}
