query "judges/{judges_id}/photo" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int judges_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 7, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Judges {
      field_name = "id"
      field_value = $input.judges_id
      output = ["id"]
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Суддю не знайдено"
    }

    // Прибираємо саме посилання, а не файл у сховищі: той самий файл може
    // бути в іншого запису. Саме так і сталося з суддями — 99 із них
    // посилаються на один файл, якого вже немає.
    db.edit Judges {
      field_name = "id"
      field_value = $input.judges_id
      data = {photo: null}
      output = ["id"]
    } as $judge
  }

  response = {cleared: 1}
}
