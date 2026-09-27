query "news-categories/{category_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int category_id filters=min:1
    text name? filters=trim
    text slug? filters=trim|lower
    int competition_id?
    int sort_order?
    bool is_active?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 13, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get news_category {
      field_name = "id"
      field_value = $input.category_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Рубрику не знайдено"
    }
    precondition ($input.name == null || $input.name != "") {
      error_type = "badrequest"
      error = "Назва рубрики порожня"
    }
    precondition ($input.slug == null || ($input.slug|regex_matches:"/^[a-z0-9]+(-[a-z0-9]+)*$/")) {
      error_type = "badrequest"
      error = "Адреса рубрики (slug) — лише малі латинські літери, цифри й дефіси: ekstra-liha"
    }
    db.query news_category {
      where = $db.news_category.slug == $input.slug && $db.news_category.id != $input.category_id
      return = {type: "count"}
    } as $dup
    precondition ($input.slug == null || $dup == 0) {
      error_type = "badrequest"
      error = "Рубрика з такою адресою (slug) уже є"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    api.lambda {
      code = """
        const out = {};
        for (const k of Object.keys($var.raw || {})) if (k !== 'category_id') out[k] = $input[k];
        out.updated_at = Date.now();
        return out;
      """
      timeout = 10
    } as $data

    db.patch news_category {
      field_name = "id"
      field_value = $input.category_id
      data = $data
    } as $item
  }

  response = $item
}
