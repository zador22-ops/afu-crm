query "tournaments/{leagues_id}/participants/{teaminfo_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int teaminfo_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query "Tournament participants" {
      where = $db.Tournament_participants.leagues_id == $input.leagues_id && $db.Tournament_participants.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id"]
    } as $rows
    foreach ($rows) {
      each as $item {
        db.del "Tournament participants" {
          field_name = "id"
          field_value = $item.id
        }
      }
    }
  }

  response = {deleted: $rows|count}
}
