query users verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    bool archived?=false
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 1, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    // output перелічений явно: у таблиці Users лежить пароль, і він не має
    // потрапляти у відповідь ніколи, навіть хешем.
    conditional {
      if ($input.archived) {
        db.query Users {
          sort = {Users.Name: "asc"}
          return = {type: "list"}
          output = ["id", "created_at", "Name", "types_of_user_roles_id", "Relevance"]
          addon = [
            {
              name  : "Types_of_user_roles"
              output: ["Type"]
              input : {Types_of_user_roles_id: $output.types_of_user_roles_id}
              as    : "_role"
            }
          ]
        } as $users
      }
      else {
        db.query Users {
          where = $db.Users.Relevance == true
          sort = {Users.Name: "asc"}
          return = {type: "list"}
          output = ["id", "created_at", "Name", "types_of_user_roles_id", "Relevance"]
          addon = [
            {
              name  : "Types_of_user_roles"
              output: ["Type"]
              input : {Types_of_user_roles_id: $output.types_of_user_roles_id}
              as    : "_role"
            }
          ]
        } as $users
      }
    }
  }

  response = $users
}
