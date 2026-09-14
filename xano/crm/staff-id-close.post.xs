query "staff/{administration_id}/close" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int administration_id filters=min:1
    date end_date
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 5, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get "Administration of teams" {
      field_name = "id"
      field_value = $input.administration_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Запис штабу не знайдено"
    }

    db.edit "Administration of teams" {
      field_name = "id"
      field_value = $input.administration_id
      data = {
        Relevance_of_the_record: false
        end_date               : $input.end_date
      }
    } as $row
  }

  response = $row
}
