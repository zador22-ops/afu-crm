query "bracket/{bracket_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // Замінити команду(и) вже створеної пари сітки (бриф crm-bracket-editor, п. 2, Андрій 14.11):
  // раніше пару можна було лише прибрати й створити заново. Раунд пари не змінюється — пересування
  // між місцями раунду окремо (move, Backend). Матчі, уже зіграні між старими командами, живуть
  // окремо в Match і тут не чіпаються.
  input {
    int bracket_id filters=min:1
    int teaminfo_id1?
    int teaminfo_id2?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 9, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Bracket {
      field_name = "id"
      field_value = $input.bracket_id
    } as $pair
    precondition ($pair != null) {
      error_type = "notfound"
      error = "Пару не знайдено"
    }

    db.get Tours {
      field_name = "id"
      field_value = $pair.tours_id
      output = ["id", "leagues_id"]
    } as $tour
    precondition ($tour != null) {
      error_type = "badrequest"
      error = "Раунд пари не знайдено"
    }

    // Нові команди: що не прийшло — лишається як було
    api.lambda {
      code = """
        const нова = (v, була) => (v != null && Number(v) > 0 ? Number(v) : була);
        return { t1: нова($input.teaminfo_id1, $var.pair.teaminfo_id1), t2: нова($input.teaminfo_id2, $var.pair.teaminfo_id2) };
      """
      timeout = 10
    } as $teams
    precondition ($teams.t1 != $teams.t2) {
      error_type = "badrequest"
      error = "Команда не може грати сама з собою"
    }

    db.query "Tournament participants" {
      where = $db.Tournament_participants.leagues_id == $tour.leagues_id && ($db.Tournament_participants.teaminfo_id == $teams.t1 || $db.Tournament_participants.teaminfo_id == $teams.t2)
      return = {type: "count"}
    } as $participants
    precondition ($participants == 2) {
      error_type = "badrequest"
      error = "Обидві команди мають бути учасницями турніру"
    }

    // Команда не може стояти у двох парах одного раунду
    db.query Bracket {
      where = $db.Bracket.tours_id == $pair.tours_id && $db.Bracket.id != $input.bracket_id && ($db.Bracket.teaminfo_id1 == $teams.t1 || $db.Bracket.teaminfo_id2 == $teams.t1 || $db.Bracket.teaminfo_id1 == $teams.t2 || $db.Bracket.teaminfo_id2 == $teams.t2)
      return = {type: "count"}
    } as $busy
    precondition ($busy == 0) {
      error_type = "badrequest"
      error = "Команда вже стоїть в іншій парі цього раунду"
    }

    db.edit Bracket {
      field_name = "id"
      field_value = $input.bracket_id
      data = {teaminfo_id1: $teams.t1, teaminfo_id2: $teams.t2}
    } as $updated
  }

  response = $updated
}
