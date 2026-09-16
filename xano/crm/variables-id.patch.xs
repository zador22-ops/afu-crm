query "variables/{variables_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int variables_id filters=min:1
    bool bool?
    text text?
    text text2?
    text explanatio?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 12, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Variables {
      field_name = "id"
      field_value = $input.variables_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Налаштування не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw

    // Рядок 2 живить чекліст організації матчу: порожній текст лишив би
    // делегата без жодного пункту в кожному наступному матчі.
    //
    // Перша версія цієї перевірки була написана як
    // `$input.text == null || $input.text != ""` — і мовчки пропускала
    // порожній рядок, бо для Xano `"" == null` істинне. Тому тут лямбда, і
    // «поле не надіслали» відрізняється від «надіслали порожнім» за сирим
    // тілом запиту, а не за значенням.
    api.lambda {
      code = """
        const keys = Object.keys($var.raw || {});
        const sent = keys.includes('text');
        const empty = String($input.text === null || $input.text === undefined ? '' : $input.text).trim() === '';
        return {wipes_checklist: Number($input.variables_id) === 2 && sent && empty};
      """
      timeout = 10
    } as $chk
    precondition (!$chk.wipes_checklist) {
      error_type = "badrequest"
      error = "Чекліст не може бути порожнім"
    }

    db.patch Variables {
      field_name = "id"
      field_value = $input.variables_id
      data = `$input|pick:($raw|keys)|unset:"variables_id"`
    } as $variable
  }

  response = $variable
}
