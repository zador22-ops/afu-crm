query "judges/{judges_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int judges_id filters=min:1
    text prizvushche? filters=trim
    text Name? filters=trim
    text po_batkovi? filters=trim
    date Date_of_birth?
    text City? filters=trim
    bool Relevance?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 7, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Judges {
      field_name = "id"
      field_value = $input.judges_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Суддю не знайдено"
    }

    // Пишемо лише ті поля, що справді прийшли в тілі: інакше пропущене поле
    // затерло б наявне значення нулем або порожнім рядком.
    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch Judges {
      field_name = "id"
      field_value = $input.judges_id
      data = `$input|pick:($raw|keys)|unset:"judges_id"`
    } as $judge
  }

  response = $judge
}
