query "news/{news_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  // Видалити можна лише чернетку. Опубліковану чи архівну — спершу зняти з
  // публікації: на неї вже можуть вести посилання з сайту й соцмереж.
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

    db.get news {
      field_name = "id"
      field_value = $input.news_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Новину не знайдено"
    }
    precondition ($was.status == "draft") {
      error_type = "badrequest"
      error = "Видалити можна лише чернетку. Опубліковану спершу зніміть з публікації або перенесіть в архів"
    }

    db.del news {
      field_name = "id"
      field_value = $input.news_id
    }
  }

  response = {deleted: 1}
}
