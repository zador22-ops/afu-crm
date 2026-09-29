query partners verb=POST {
  api_group = "crm"
  auth = "Users"

  // Новий партнер стає в кінець списку
  input {
    text name filters=trim
    text url? filters=trim
    text category? filters=trim
    bool is_active?=true
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: __RIGHT__, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.name != "") {
      error_type = "badrequest"
      error = "Назва партнера порожня"
    }
    // Адреса сайту партнера — лише https (вимога afu-crm#5)
    api.lambda {
      code = """
        const u = $input.url;
        return u === null || u === undefined || u === '' || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(String(u));
      """
      timeout = 10
    } as $urlOk
    precondition ($urlOk == true) {
      error_type = "badrequest"
      error = "Адреса сайту партнера має починатися з https://"
    }

    db.query partner {
      return = {type: "list"}
      output = ["sort_order"]
    } as $all
    api.lambda {
      code = """
        return ($var.all || []).reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), 0) + 1;
      """
      timeout = 10
    } as $next

    db.add partner {
      data = {
        created_at: "now"
        updated_at: "now"
        name      : $input.name
        url       : $input.url
        category  : $input.category
        is_active : $input.is_active
        sort_order: $next
      }
    } as $item
  }

  response = $item
}
