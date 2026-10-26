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

    // Пароль перевіряємо завжди — і коли пошти немає (фіктивним хешем), щоб
    // за часом відповіді не можна було дізнатися, які адреси зареєстровані
    // (Backend, 26.10). Фіктивний хеш — bcrypt від випадкового рядка, який
    // ніхто не знає; «$» складаємо з коду символу, щоб XanoScript не прочитав
    // його як змінну.
    api.lambda {
      code = """
        const д = String.fromCharCode(36);
        return д + '2y' + д + '10' + д + 'uWbImdh9EzCPwNo/KG/2UeeaRWQ6VyZKyhHxbzlDlgW8C.8w0ZlaS';
      """
      timeout = 10
    } as $dummy_hash
    var $hash {
      value = $dummy_hash
    }
    conditional {
      if ($account != null) {
        var.update $hash {
          value = $account.password
        }
      }
    }
    security.check_password {
      text_password = $input.password
      hash_password = $hash
    } as $pass_ok

    // Обмеження спроб (задача 1.2б, PM 2 26.10): 10 невдалих паролів поспіль —
    // 15 хв відмови з тим самим текстом; успішний вхід скидає лічильник. Поки
    // заблоковано, спроби не рахуються. Для невідомої пошти нічого не пишемо.
    api.lambda {
      code = """
        const СПРОБ = 10;
        const БЛОК = 15 * 60 * 1000;
        const a = $var.account;
        const зараз = Date.now();
        if (!a) return { locked: false, fail: false, failed_logins: 0, locked_until: null };
        const locked = Number(a.locked_until) > зараз;
        const fail = !locked && !$var.pass_ok;
        const спроба = (Number(a.failed_logins) || 0) + 1;
        return {
          locked,
          fail,
          failed_logins: fail ? (спроба >= СПРОБ ? 0 : спроба) : Number(a.failed_logins) || 0,
          locked_until: fail && спроба >= СПРОБ ? зараз + БЛОК : null,
        };
      """
      timeout = 10
    } as $attempt

    // Записати ДО відмови: precondition обриває запит, а транзакції немає
    conditional {
      if ($attempt.fail) {
        db.edit club_account {
          field_name = "id"
          field_value = $account.id
          data = {failed_logins: $attempt.failed_logins, locked_until: $attempt.locked_until}
        } as $failed
      }
    }

    // Одне повідомлення на «немає такої пошти», «не той пароль» і «заблоковано»:
    // не підказуємо, які адреси зареєстровані й що акаунт заблоковано
    precondition ($account != null && !$attempt.locked && $pass_ok) {
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
      data = {last_login_at: "now", failed_logins: 0, locked_until: null}
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
