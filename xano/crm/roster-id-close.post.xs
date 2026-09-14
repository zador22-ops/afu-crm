query "roster/{team_id}/close" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int team_id filters=min:1
    date End_date
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

    db.edit Team {
      field_name = "id"
      field_value = $input.team_id
      data = {
        Relevance_of_the_record: false
        End_date               : $input.End_date
      }
    } as $row
  }

  response = $row
}
