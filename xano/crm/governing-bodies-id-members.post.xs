query "governing-bodies/{body_id}/members" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Новий член складу — в кінець. Лише ім'я, прізвище, посада, фото:
  // по батькові, телефонів і особистих email тут немає навмисно
  input {
    int body_id filters=min:1
    text first_name filters=trim
    text last_name filters=trim
    text position filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 16, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.get governing_body {
      field_name = "id"
      field_value = $input.body_id
    } as $body
    precondition ($body != null) {
      error_type = "notfound"
      error = "Орган не знайдено"
    }
    precondition ($input.first_name != "" && $input.last_name != "") {
      error_type = "badrequest"
      error = "Потрібні ім'я та прізвище"
    }
    db.query governing_member {
      where = $db.governing_member.body_id == $input.body_id
      return = {type: "list"}
      output = ["sort_order"]
    } as $all
    api.lambda {
      code = """
        return ($var.all || []).reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), 0) + 1;
      """
      timeout = 10
    } as $next
    db.add governing_member {
      data = {created_at: "now", updated_at: "now", body_id: $input.body_id, first_name: $input.first_name, last_name: $input.last_name, position: $input.position, is_active: true, sort_order: $next}
    } as $item
  }

  response = $item
}
