query "partners/{partner_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // Змінюються лише передані поля; «приховати» — is_active = false
  input {
    int partner_id filters=min:1
    text name? filters=trim
    text url? filters=trim
    text category? filters=trim
    bool is_active?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 14, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get partner {
      field_name = "id"
      field_value = $input.partner_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Партнера не знайдено"
    }
    precondition ($input.name == null || $input.name != "") {
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

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    api.lambda {
      code = """
        const out = {};
        for (const k of Object.keys($var.raw || {})) if (k !== 'partner_id') out[k] = $input[k];
        out.updated_at = Date.now();
        return out;
      """
      timeout = 10
    } as $data

    db.patch partner {
      field_name = "id"
      field_value = $input.partner_id
      data = $data
    } as $item
  }

  response = $item
}
