query documents verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int category_id?=0
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 15, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.query document {
      return = {type: "list"}
    } as $all
    api.lambda {
      code = """
        const c = Number($input.category_id) || 0;
        return ($var.all || []).filter((d) => !c || d.category_id === c)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(b.document_date || '').localeCompare(String(a.document_date || '')) || b.id - a.id);
      """
      timeout = 10
    } as $out
  }

  response = $out
}
