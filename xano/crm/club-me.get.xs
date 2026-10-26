query "club/me" verb=GET {
  api_group = "crm"
  auth = "club_account"

  // «Хто я» для представника клубу: акаунт і клуби, до яких він має доступ
  // (club_account_club, активні прив'язки). Фарм-клуб — другий рядок того ж
  // акаунта (рішення Андрія 8.2). acted_by_users_id — Адмін, якщо це вхід
  // «як клуб» (POST club-accounts/{id}/impersonate), інакше null.
  input {
  }

  stack {
    db.get club_account {
      field_name = "id"
      field_value = $auth.id
    } as $account
    precondition ($account != null && $account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }

    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $auth.id && $db.club_account_club.is_active == true
      sort = {club_account_club.id: "asc"}
      return = {type: "list"}
      output = ["teaminfo_id"]
    } as $links
    // Клубів у базі кілька десятків — простіше прочитати всі й з'єднати в
    // лямбді, ніж join (той самий підхід, що в data-issues)
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo", "parent_teaminfo_id"]
    } as $teams
    api.lambda {
      code = """
        const клуб = new Map(($var.teams || []).map((t) => [t.id, t]));
        return ($var.links || []).map((l) => {
          const t = клуб.get(l.teaminfo_id) || {};
          return { teaminfo_id: l.teaminfo_id, name: t.TeamName || null, logo: t.TeamLogo || null, parent_teaminfo_id: t.parent_teaminfo_id || null };
        });
      """
      timeout = 10
    } as $clubs
  }

  response = {account: {id: $account.id, name: $account.name, email: $account.email}, acted_by_users_id: $auth.extras.acted_by_users_id, clubs: $clubs}
}
