query "tours/{tours_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int tours_id filters=min:1
    text TourName filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.TourName != "") {
      error_type = "badrequest"
      error = "Назва туру порожня"
    }

    db.edit Tours {
      field_name = "id"
      field_value = $input.tours_id
      data = {TourName: $input.TourName}
    } as $tour
  }

  response = $tour
}
