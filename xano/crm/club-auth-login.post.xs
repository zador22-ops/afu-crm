query "club/auth/login" verb=POST {
  api_group = "crm"

  // Вхід представника клубу (самообслуговування клубів, задача 1.2; контракт
  // AFU docs/xano/club-self-service-model.md). Окрема auth-таблиця
  // club_account, а не Users: її токен не приймає жоден наявний ендпоінт
  // з авторизацією на Users — 401, тож клуб не читає чужих клубів, осіб і матчів.
  // Логін — пошта (у нижньому регістрі), пароль задає АФУ.
  input {
    text email filters=trim|lower
    text password
  }

  stack {
    db.get club_account {
      field_name = "email"
      field_value = $input.email
    } as $account

    // Одне повідомлення на «немає такої пошти» й «не той пароль»: не
    // підказуємо, які адреси зареєстровані
    precondition ($account != null) {
      error_type = "accessdenied"
      error = "Неправильна пошта або пароль"
    }
    security.check_password {
      text_password = $input.password
      hash_password = $account.password
    } as $pass_ok
    precondition ($pass_ok) {
      error_type = "accessdenied"
      error = "Неправильна пошта або пароль"
    }
    precondition ($account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }

    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $account.id && $db.club_account_club.is_active == true
      return = {type: "count"}
    } as $clubs
    precondition ($clubs > 0) {
      error_type = "accessdenied"
      error = "Акаунт ще не прив'язаний до клубу. Зверніться до АФУ"
    }

    db.edit club_account {
      field_name = "id"
      field_value = $account.id
      data = {last_login_at: "now"}
    } as $touched

    // 12 год — як вхід співробітників (auth/login, Users)
    security.create_auth_token {
      table = "club_account"
      extras = {}
      expiration = 43200
      id = $account.id
    } as $authToken
  }

  // Без пароля: лише те, що треба CRM
  response = {authToken: $authToken, account: {id: $account.id, name: $account.name, email: $account.email}}
}
