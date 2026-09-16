query roles verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text Type filters=trim
    json access_rights_id?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 1, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.Type != "") {
      error_type = "badrequest"
      error = "Назва ролі порожня"
    }

    db.add "Types of user roles" {
      data = {
        created_at      : "now"
        Type            : $input.Type
        access_rights_id: $input.access_rights_id
      }
    } as $role
  }

  response = $role
}
