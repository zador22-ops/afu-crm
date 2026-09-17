query "staff-cards/{card_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int card_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 4, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.del "Statistic Administration of teams" {
      field_name = "id"
      field_value = $input.card_id
    }
  }

  response = {deleted: 1}
}
