query "governing-bodies/{body_id}/members/reorder" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Порядок у складі органу
  input {
    int body_id filters=min:1
    int[] ids
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: __RIGHT_GOV__, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    db.query governing_member {
      where = $db.governing_member.body_id == $input.body_id
      return = {type: "list"}
      output = ["id"]
    } as $all
    api.lambda {
      code = """
        const have = new Set(($var.all || []).map((p) => p.id));
        const ids = ($input.ids || []).map(Number);
        const ok = ids.length === have.size && new Set(ids).size === ids.length && ids.every((i) => have.has(i));
        return { ok, pairs: ids.map((id, i) => ({ id, sort_order: i + 1 })) };
      """
      timeout = 10
    } as $plan
    precondition ($plan.ok == true) {
      error_type = "badrequest"
      error = "Порядок має містити кожного члена складу рівно один раз — оновіть сторінку"
    }
    foreach ($plan.pairs) {
      each as $p {
        db.edit governing_member {
          field_name = "id"
          field_value = $p.id
          data = {sort_order: $p.sort_order, updated_at: "now"}
        } as $row
      }
    }
  }

  response = {updated: $plan.pairs|count}
}
