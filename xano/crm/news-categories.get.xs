query "news-categories" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 13, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query news_category {
      sort = {news_category.sort_order: "asc", news_category.name: "asc"}
      return = {type: "list"}
    } as $items
  }

  response = $items
}
