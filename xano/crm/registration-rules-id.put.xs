query "registration-rules/{leagues_id}" verb=PUT {
  api_group = "crm"
  auth = "Users"

  // Прапорець «склад лише в заявковий період» для турніру (3.4). Право 21.
  // registration_rule — один рядок на турнір (унікальний leagues_id): немає —
  // створюється, є — змінюється.
  input {
    int leagues_id filters=min:1
    bool window_only
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Leagues {
      field_name = "id"
      field_value = $input.leagues_id
      output = ["id"]
    } as $league
    precondition ($league != null) {
      error_type = "notfound"
      error = "Турнір не знайдено"
    }
    db.get registration_rule {
      field_name = "leagues_id"
      field_value = $input.leagues_id
      output = ["id"]
    } as $was
    conditional {
      if ($was == null) {
        db.add registration_rule {
          data = {created_at: "now", leagues_id: $input.leagues_id, window_only: $input.window_only, updated_by_users_id: $auth.id}
        } as $added
      }
      else {
        db.edit registration_rule {
          field_name = "id"
          field_value = $was.id
          data = {window_only: $input.window_only, updated_by_users_id: $auth.id}
        } as $edited
      }
    }
  }

  response = {leagues_id: $input.leagues_id, window_only: $input.window_only}
}
