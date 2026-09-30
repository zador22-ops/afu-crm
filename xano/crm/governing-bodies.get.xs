query "governing-bodies" verb=GET {
  api_group = "crm"
  auth = "Users"

  // Органи разом зі складом (усі, зокрема прибрані — is_active = false)
  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 16, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.query governing_body {
      return = {type: "list"}
    } as $bodies
    db.query governing_member {
      return = {type: "list"}
    } as $members
    api.lambda {
      code = """
        const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
        return ($var.bodies || []).sort(bySort).map((b) => ({ ...b, members: ($var.members || []).filter((m) => m.body_id === b.id).sort(bySort) }));
      """
      timeout = 10
    } as $out
  }

  response = $out
}
