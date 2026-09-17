query "bracket/{bracket_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int bracket_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 9, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    // Пара — це лише запис сітки: матч, зіграний між тими командами, живе
    // окремо в Match і тут не чіпається.
    db.del Bracket {
      field_name = "id"
      field_value = $input.bracket_id
    }
  }

  response = {deleted: 1}
}
