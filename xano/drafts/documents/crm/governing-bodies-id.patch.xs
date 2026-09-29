query "governing-bodies/{body_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int body_id filters=min:1
    text name? filters=trim
    text slug? filters=trim|lower
    text kind? filters=trim
    text description? filters=trim
    text contact_email? filters=trim
    bool is_active?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: __RIGHT_GOV__, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.get governing_body {
      field_name = "id"
      field_value = $input.body_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Орган не знайдено"
    }
    precondition ($input.kind == null || $input.kind == "presidium" || $input.kind == "executive_committee" || $input.kind == "committee" || $input.kind == "directorate") {
      error_type = "badrequest"
      error = "Тип органу: presidium, executive_committee, committee або directorate"
    }
    api.lambda {
      code = """
        const e = $input.contact_email;
        return e === null || e === undefined || e === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e));
      """
      timeout = 10
    } as $emailOk
    precondition ($emailOk == true) {
      error_type = "badrequest"
      error = "Службова пошта органу виглядає неправильно"
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
      error = "Адреса органу (slug) — лише малі латинські літери, цифри й дефіси"
    }
    db.query governing_body {
      where = $db.governing_body.slug == $input.slug && $db.governing_body.id != $input.body_id
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
        for (const k of Object.keys($var.raw || {})) if (k !== 'body_id') out[k] = $input[k];
        out.updated_at = Date.now();
        return out;
      """
      timeout = 10
    } as $data
    db.patch governing_body {
      field_name = "id"
      field_value = $input.body_id
      data = $data
    } as $item
  }

  response = $item
}
