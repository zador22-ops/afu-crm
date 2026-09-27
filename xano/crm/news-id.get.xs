query "news/{news_id}" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int news_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 13, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query news {
      where = $db.news.id == $input.news_id
      return = {type: "single"}
      addon = [
        {
          name  : "news_category"
          output: ["id", "name", "slug"]
          input : {news_category_id: $output.category_id}
          as    : "_category"
        }
      ]
    } as $item
    precondition ($item != null) {
      error_type = "notfound"
      error = "Новину не знайдено"
    }
  }

  response = $item
}
