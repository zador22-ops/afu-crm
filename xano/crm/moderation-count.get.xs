query "moderation/count" verb=GET {
  api_group = "crm"
  auth = "Users"

  // Лічильник для меню «Погодження» (самообслуговування клубів, 4.1): скільки
  // пакетів чекають рішення — у пакеті є рядок submitted (закриття пакета —
  // за рядками, контракт 4.2 розділ 0). Право 21.
  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query change_request {
      where = $db.change_request.status == "submitted" && $db.change_request.batch_id != null
      return = {type: "list"}
      output = ["batch_id"]
    } as $open
    api.lambda {
      code = """
        return { batches: new Set(($var.open || []).map((r) => r.batch_id)).size, rows: ($var.open || []).length };
      """
      timeout = 5
    } as $count
  }

  response = $count
}
