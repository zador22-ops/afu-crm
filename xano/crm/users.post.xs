query users verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text Name filters=trim
    password password
    int types_of_user_roles_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 1, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.Name != "") {
      error_type = "badrequest"
      error = "Імʼя порожнє"
    }

    // Вхід у застосунки — за іменем, тож воно має бути унікальним: інакше
    // auth/login знайде першого-ліпшого і людина потрапить у чужий акаунт.
    db.get Users {
      field_name = "Name"
      field_value = $input.Name
    } as $exists
    precondition ($exists == null) {
      error_type = "badrequest"
      error = "Користувач із таким імʼям уже є"
    }

    db.get "Types of user roles" {
      field_name = "id"
      field_value = $input.types_of_user_roles_id
    } as $role
    precondition ($role != null) {
      error_type = "notfound"
      error = "Роль не знайдено"
    }

    db.add Users {
      data = {
        created_at            : "now"
        Name                  : $input.Name
        password              : $input.password
        types_of_user_roles_id: $input.types_of_user_roles_id
        Relevance             : true
      }

      output = ["id", "Name", "types_of_user_roles_id", "Relevance"]
    } as $user
  }

  response = $user
}
