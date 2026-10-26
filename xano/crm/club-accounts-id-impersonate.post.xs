query "club-accounts/{club_account_id}/impersonate" verb=POST {
  api_group = "crm"
  auth = "Users"

  // «Увійти як клуб» (рішення Андрія 8.1): Адмін допомагає клубу заповнити
  // дані. Право 22. Видає токен club_account цього акаунта на 1 год; в extras
  // — хто з АФУ діє (acted_by_users_id), щоб заявки записали Адміна поруч з
  // акаунтом клубу (контракт 1.1, п. 2.2). Токен Адміна в Users не змінюється.
  input {
    int club_account_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 22, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get club_account {
      field_name = "id"
      field_value = $input.club_account_id
      output = ["id", "name", "is_active"]
    } as $account
    precondition ($account != null) {
      error_type = "notfound"
      error = "Акаунт клубу не знайдено"
    }
    precondition ($account.is_active) {
      error_type = "badrequest"
      error = "Акаунт клубу вимкнено — увімкніть його, щоб увійти як клуб"
    }
    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $input.club_account_id && $db.club_account_club.is_active == true
      return = {type: "count"}
    } as $clubs
    precondition ($clubs > 0) {
      error_type = "badrequest"
      error = "Акаунт не прив'язаний до клубу"
    }

    security.create_auth_token {
      table = "club_account"
      extras = {acted_by_users_id: $auth.id}
      expiration = 3600
      id = $account.id
    } as $authToken
  }

  response = {authToken: $authToken, expires_in: 3600, account: {id: $account.id, name: $account.name}}
}
