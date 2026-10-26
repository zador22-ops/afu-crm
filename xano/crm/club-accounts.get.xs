query "club-accounts" verb=GET {
  api_group = "crm"
  auth = "Users"

  // Акаунти представників клубів (самообслуговування клубів, задача 1.2) —
  // для «Користувачі» в CRM. Право 22 «Акаунти клубів». Без пароля.
  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 22, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query club_account {
      sort = {club_account.id: "asc"}
      return = {type: "list"}
      output = ["id", "created_at", "email", "name", "is_active", "last_login_at", "created_by_users_id"]
    } as $accounts
    db.query club_account_club {
      where = $db.club_account_club.is_active == true
      return = {type: "list"}
      output = ["club_account_id", "teaminfo_id"]
    } as $links
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName"]
    } as $teams

    api.lambda {
      code = """
        const назва = new Map(($var.teams || []).map((t) => [t.id, t.TeamName]));
        return ($var.accounts || []).map((a) => ({
          ...a,
          clubs: ($var.links || []).filter((l) => l.club_account_id === a.id).map((l) => ({ teaminfo_id: l.teaminfo_id, name: назва.get(l.teaminfo_id) || null })),
        }));
      """
      timeout = 10
    } as $list
  }

  response = $list
}
