query "matches/{match_id}/organization" verb=PUT {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    // [{title, remark, remark_text}] — лише ті пункти, які делегат заповнив
    json items?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 8, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Match {
      field_name = "id"
      field_value = $input.match_id
    } as $match
    precondition ($match != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }

    db.query "Organization Match" {
      where = $db.Organization_Match.match_id == $input.match_id
      return = {type: "list"}
      output = ["id", "title"]
    } as $existing

    // Пункти зіставляємо за назвою, а не переписуємо список цілком: до рядка
    // можуть бути прикріплені фото, і видалення рядка забрало б їх із собою.
    api.lambda {
      code = """
        const було = new Map((Array.isArray($var.existing) ? $var.existing : []).map((r) => [String(r.title), r.id]));
        const items = (Array.isArray($input.items) ? $input.items : [])
          .map((i) => ({
            title: String(i.title || '').trim(),
            remark: i.remark === true || i.remark === 'true',
            remark_text: String(i.remark_text || '').trim(),
          }))
          .filter((i) => i.title);
        return {
          update: items.filter((i) => було.has(i.title)).map((i) => ({ ...i, id: було.get(i.title) })),
          create: items.filter((i) => !було.has(i.title)),
        };
      """
      timeout = 10
    } as $plan

    foreach ($plan.update) {
      each as $i {
        db.edit "Organization Match" {
          field_name = "id"
          field_value = $i.id
          data = {Remark: $i.remark, Remark_text: $i.remark_text}
        } as $upd
      }
    }
    foreach ($plan.create) {
      each as $i {
        db.add "Organization Match" {
          data = {
            created_at : "now"
            match_id   : $input.match_id
            title      : $i.title
            Remark     : $i.remark
            Remark_text: $i.remark_text
          }
        } as $new
      }
    }
  }

  response = {updated: `$plan.update|count`, created: `$plan.create|count`}
}
