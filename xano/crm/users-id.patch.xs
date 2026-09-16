query "users/{users_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int users_id filters=min:1
    text Name? filters=trim
    int types_of_user_roles_id?
    bool Relevance?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 1, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Users {
      field_name = "id"
      field_value = $input.users_id
      output = ["id", "Name", "types_of_user_roles_id", "Relevance"]
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Користувача не знайдено"
    }

    // Зняти активність із самого себе не можна: інакше адміністратор
    // одним кліком замикає себе поза системою, і повернути доступ буде нічим.
    precondition ($input.Relevance != false || $input.users_id != $auth.id) {
      error_type = "badrequest"
      error = "Не можна деактивувати власний акаунт"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch Users {
      field_name = "id"
      field_value = $input.users_id
      data = `$input|pick:($raw|keys)|unset:"users_id"`
      output = ["id", "Name", "types_of_user_roles_id", "Relevance"]
    } as $user
  }

  response = $user
}
