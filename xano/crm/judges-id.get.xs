query "judges/{judges_id}" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int judges_id filters=min:1
  }

  stack {
    db.get Judges {
      field_name = "id"
      field_value = $input.judges_id
    } as $judge
    precondition ($judge != null) {
      error_type = "notfound"
      error = "Суддю не знайдено"
    }
  }

  response = $judge
}
