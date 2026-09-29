query "documents/{document_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // Опублікувати можна лише документ із файлом
  input {
    int document_id filters=min:1
    text title? filters=trim
    int category_id?
    text description? filters=trim
    date document_date?
    int season_id?
    bool is_published?
    int sort_order?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: __RIGHT_DOCS__, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.get document {
      field_name = "id"
      field_value = $input.document_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Документ не знайдено"
    }
    precondition ($input.title == null || $input.title != "") {
      error_type = "badrequest"
      error = "Назва документа порожня"
    }
    precondition ($input.is_published != true || $was.file != null) {
      error_type = "badrequest"
      error = "Спершу завантажте файл документа, потім публікуйте"
    }
    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    api.lambda {
      code = """
        const out = {};
        for (const k of Object.keys($var.raw || {})) if (k !== 'document_id') out[k] = $input[k];
        out.updated_at = Date.now();
        return out;
      """
      timeout = 10
    } as $data
    db.patch document {
      field_name = "id"
      field_value = $input.document_id
      data = $data
    } as $item
  }

  response = $item
}
