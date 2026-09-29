query "document-categories" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text name filters=trim
    text slug filters=trim|lower
    int sort_order?=0
    bool is_active?=true
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: __RIGHT_DOCS__, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.name != "") {
      error_type = "badrequest"
      error = "Назва рубрики порожня"
    }
    precondition ($input.slug != "") {
      error_type = "badrequest"
      error = "Адреса рубрики (slug) порожня"
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
      where = $db.document_category.slug == $input.slug && $db.document_category.id != 0
      return = {type: "count"}
    } as $dup
    precondition ($input.slug == null || $input.slug == "" || $dup == 0) {
      error_type = "badrequest"
      error = "Така адреса (slug) уже є"
    }
    db.add document_category {
      data = {created_at: "now", updated_at: "now", name: $input.name, slug: $input.slug, sort_order: $input.sort_order, is_active: $input.is_active}
    } as $item
  }

  response = $item
}
