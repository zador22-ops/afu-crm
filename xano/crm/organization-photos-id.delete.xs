query "organization-photos/{photo_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int photo_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 8, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.del "Organization Match Photos" {
      field_name = "id"
      field_value = $input.photo_id
    }
  }

  response = {deleted: 1}
}
