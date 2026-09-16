query "users/{users_id}/password" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int users_id filters=min:1
    password password
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
      output = ["id"]
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Користувача не знайдено"
    }

    // Пароль окремим ендпоінтом, а не в загальній правці: так його не можна
    // затерти випадково, надіславши форму без цього поля.
    db.edit Users {
      field_name = "id"
      field_value = $input.users_id
      data = {password: $input.password}
      output = ["id"]
    } as $user
  }

  response = {updated: 1}
}
