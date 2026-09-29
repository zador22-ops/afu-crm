query "document-categories" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: __RIGHT_DOCS__, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.query document_category {
      sort = {document_category.sort_order: "asc", document_category.name: "asc"}
      return = {type: "list"}
    } as $items
  }

  response = $items
}
