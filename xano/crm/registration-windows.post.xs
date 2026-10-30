query "registration-windows" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Додати заявковий період турніру (3.4). Право 21. Час — epoch мс (CRM
  // переводить із київського). Періоди одного турніру не перетинаються.
  input {
    int leagues_id filters=min:1
    timestamp starts_at
    timestamp ends_at
    text note? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Leagues {
      field_name = "id"
      field_value = $input.leagues_id
      output = ["id"]
    } as $league
    precondition ($league != null) {
      error_type = "notfound"
      error = "Турнір не знайдено"
    }
    db.query registration_window {
      where = $db.registration_window.leagues_id == $input.leagues_id
      return = {type: "list"}
      output = ["id", "leagues_id", "starts_at", "ends_at"]
    } as $others
    api.lambda {
      code = """
        const поч = Number($input.starts_at);
        const кін = Number($input.ends_at);
        const свої = ($var.others || []).filter((w) => w.leagues_id === Number($input.leagues_id) && w.id !== 0);
        return {
          order_ok: Number.isFinite(поч) && Number.isFinite(кін) && поч < кін,
          // вікна одного турніру не перетинаються — інакше незрозуміло, яке з них діє
          overlap_ok: !свої.some((w) => поч < Number(w.ends_at) && Number(w.starts_at) < кін),
          note_ok: String($input.note || '').length <= 200,
        };
      """
      timeout = 5
    } as $check
    precondition ($check.order_ok) {
      error_type = "badrequest"
      error = "Кінець періоду має бути пізніше за початок"
    }
    precondition ($check.overlap_ok) {
      error_type = "badrequest"
      error = "Цей період перетинається з іншим періодом турніру"
    }
    precondition ($check.note_ok) {
      error_type = "badrequest"
      error = "Примітка — до 200 знаків"
    }

    db.add registration_window {
      data = {created_at: "now", leagues_id: $input.leagues_id, starts_at: $input.starts_at, ends_at: $input.ends_at, note: $input.note, created_by_users_id: $auth.id}
    } as $window
  }

  response = $window
}
