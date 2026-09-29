query "governing-bodies" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text name filters=trim
    text slug filters=trim|lower
    text kind filters=trim
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
    precondition ($input.name != "") {
      error_type = "badrequest"
      error = "Назва органу порожня"
    }
    precondition ($input.slug != "") {
      error_type = "badrequest"
      error = "Адреса (slug) порожня"
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
      where = $db.governing_body.slug == $input.slug && $db.governing_body.id != 0
      return = {type: "count"}
    } as $dup
    precondition ($input.slug == null || $input.slug == "" || $dup == 0) {
      error_type = "badrequest"
      error = "Така адреса (slug) уже є"
    }
    db.query governing_body {
      return = {type: "list"}
      output = ["sort_order"]
    } as $all
    api.lambda {
      code = """
        return ($var.all || []).reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), 0) + 1;
      """
      timeout = 10
    } as $next
    db.add governing_body {
      data = {created_at: "now", updated_at: "now", name: $input.name, slug: $input.slug, kind: $input.kind, description: $input.description, contact_email: $input.contact_email, is_active: true, sort_order: $next}
    } as $item
  }

  response = $item
}
