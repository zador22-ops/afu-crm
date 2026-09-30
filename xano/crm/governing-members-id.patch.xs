query "governing-members/{member_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // «Прибрати зі складу» — is_active = false: запис лишається, його можна повернути
  input {
    int member_id filters=min:1
    text first_name? filters=trim
    text last_name? filters=trim
    text position? filters=trim
    bool is_active?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 16, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.get governing_member {
      field_name = "id"
      field_value = $input.member_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Члена складу не знайдено"
    }
    precondition (($input.first_name == null || $input.first_name != "") && ($input.last_name == null || $input.last_name != "")) {
      error_type = "badrequest"
      error = "Ім'я та прізвище не можуть бути порожніми"
    }
    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    api.lambda {
      code = """
        const out = {};
        for (const k of Object.keys($var.raw || {})) if (k !== 'member_id') out[k] = $input[k];
        out.updated_at = Date.now();
        return out;
      """
      timeout = 10
    } as $data
    db.patch governing_member {
      field_name = "id"
      field_value = $input.member_id
      data = $data
    } as $item
  }

  response = $item
}
