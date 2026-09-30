query "document-categories/{category_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int category_id filters=min:1
    text name? filters=trim
    text slug? filters=trim|lower
    int sort_order?
    bool is_active?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 15, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.get document_category {
      field_name = "id"
      field_value = $input.category_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Рубрику не знайдено"
    }
    api.lambda {
      code = """
        const s = $input.slug;
        return s === null || s === undefined || s === '' || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(s));
      """
      timeout = 10
    } as $slugOk
    precondition ($slugOk == true) {
      error_type = "badrequest"
      error = "Адреса рубрики (slug) — лише малі латинські літери, цифри й дефіси"
    }
    db.query document_category {
      where = $db.document_category.slug == $input.slug && $db.document_category.id != $input.category_id
      return = {type: "count"}
    } as $dup
    precondition ($input.slug == null || $input.slug == "" || $dup == 0) {
      error_type = "badrequest"
      error = "Така адреса (slug) уже є"
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
    db.patch document_category {
      field_name = "id"
      field_value = $input.category_id
      data = $data
    } as $item
  }

  response = $item
}
