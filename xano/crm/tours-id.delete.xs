query "tours/{tours_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int tours_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query Match {
      where = $db.Match.tours_id == $input.tours_id
      return = {type: "count"}
    } as $matches
    precondition ($matches == 0) {
      error_type = "input"
      error = "У турі є матчі, видалити не можна"
    }
    db.query Bracket {
      where = $db.Bracket.tours_id == $input.tours_id
      return = {type: "count"}
    } as $pairs
    precondition ($pairs == 0) {
      error_type = "input"
      error = "На тур посилається сітка, видалити не можна"
    }

    db.del Tours {
      field_name = "id"
      field_value = $input.tours_id
    }
  }

  response = {deleted: 1}
}
