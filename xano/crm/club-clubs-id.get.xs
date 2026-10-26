query "club/clubs/{teaminfo_id}" verb=GET {
  api_group = "crm"
  auth = "club_account"

  // Картка свого клубу для кабінету представника («Мій клуб», задача 1.3).
  // Лише поля, які клуб бачить і пропонує змінити (ТЗ 2.1), плюс назва й
  // материнський клуб для показу. Контактні поля — свої, клуб їх і заповнює.
  input {
    int teaminfo_id filters=min:1
  }

  stack {
    // СТОРОЖ «лише свій клуб» (контракт 1.1, п. 2.2) — однаковий текст у
    // кожному клубному ендпоінті з teaminfo_id; src/utils/clubGuard.test.js
    // перевіряє, що він є і стоїть до будь-якого читання даних клубу.
    db.get club_account {
      field_name = "id"
      field_value = $auth.id
    } as $guard_account
    precondition ($guard_account != null && $guard_account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }
    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $auth.id && $db.club_account_club.teaminfo_id == $input.teaminfo_id && $db.club_account_club.is_active == true
      return = {type: "count"}
    } as $guard_own
    precondition ($guard_own > 0) {
      error_type = "accessdenied"
      error = "Це не ваш клуб"
    }
    // /СТОРОЖ

    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
      output = ["id", "TeamName", "TeamLogo", "TeamPhoto", "TeamInfo", "founded_year", "home_venues_id", "website", "instagram", "facebook", "youtube", "colors", "kit_color_primary", "kit_color_secondary", "contact_name", "contact_phone", "contact_email", "parent_teaminfo_id"]
    } as $club
    precondition ($club != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }
  }

  response = $club
}
