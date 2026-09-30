query documents verb=POST {
  api_group = "crm"
  auth = "Users"

  // Новий документ — неопублікований; файл окремо: POST /documents/{id}/file
  input {
    text title filters=trim
    int category_id filters=min:1
    text description? filters=trim
    date document_date?
    int season_id?
    bool is_published?
    int sort_order?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 15, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.title != "") {
      error_type = "badrequest"
      error = "Назва документа порожня"
    }
    db.get document_category {
      field_name = "id"
      field_value = $input.category_id
    } as $cat
    precondition ($cat != null) {
      error_type = "notfound"
      error = "Рубрику не знайдено"
    }
    db.add document {
      data = {created_at: "now", updated_at: "now", title: $input.title, category_id: $input.category_id, description: $input.description, document_date: $input.document_date, season_id: $input.season_id, is_published: false, sort_order: $input.sort_order}
    } as $item
  }

  response = $item
}
