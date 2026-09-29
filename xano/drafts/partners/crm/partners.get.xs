query partners verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 14, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query partner {
      sort = {partner.sort_order: "asc", partner.id: "asc"}
      return = {type: "list"}
    } as $items
  }

  response = $items
}
