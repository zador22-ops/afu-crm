query "users/{users_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  // Видалити можна лише користувача, на якого ніщо не посилається: делегата
  // матчу (Match.users_idDelegat) чи автора новини (news.created_by/updated_by).
  // Інакше матчі й новини лишились би з номером людини, якої вже немає.
  // Для таких є деактивація: увійти не зможуть, а історія ціла.
  input {
    int users_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 1, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    precondition ($input.users_id != $auth.id) {
      error_type = "badrequest"
      error = "Не можна видалити власний акаунт"
    }

    db.get Users {
      field_name = "id"
      field_value = $input.users_id
      output = ["id", "Name"]
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Користувача не знайдено"
    }

    db.query Match {
      where = $db.Match.users_idDelegat == $input.users_id
      return = {type: "count"}
    } as $matches

    db.query news {
      where = $db.news.created_by == $input.users_id || $db.news.updated_by == $input.users_id
      return = {type: "count"}
    } as $news

    // Повідомлення з числами — у JS: склеювання рядків і чисел XanoScript-ом ненадійне
    api.lambda {
      code = """
        const m = Number($var.matches) || 0;
        const n = Number($var.news) || 0;
        if (!m && !n) return { ok: true, message: '' };
        const parts = [];
        if (m) parts.push(`делегат у ${m} матч${m % 10 === 1 && m % 100 !== 11 ? 'і' : 'ах'}`);
        if (n) parts.push(`автор ${n} новин${n % 10 === 1 && n % 100 !== 11 ? 'и' : ''}`);
        return { ok: false, message: `${$var.was.Name}: ${parts.join(' і ')}. Видалення зламало б ці записи — деактивуйте користувача замість видалення` };
      """
      timeout = 10
    } as $check

    precondition ($check.ok == true) {
      error_type = "badrequest"
      error = $check.message
    }

    db.del Users {
      field_name = "id"
      field_value = $input.users_id
    }
  }

  response = {deleted: 1}
}
