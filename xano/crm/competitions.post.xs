query competitions verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text name filters=trim
    text type filters=trim
    text short_name? filters=trim
    int sort_order?=0
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.name != "") {
      error_type = "input"
      error = "Назва змагання порожня"
    }
    precondition ($input.type == "ліга" || $input.type == "кубок") {
      error_type = "input"
      error = "Тип має бути «ліга» або «кубок»"
    }

    db.add league {
      data = {
        created_at: "now"
        name      : $input.name
        type      : $input.type
        short_name: $input.short_name
        sort_order: $input.sort_order
      }
    } as $item
  }

  response = $item
}
