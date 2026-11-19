// Замінити команду(и) вже створеної пари сітки (бриф crm-bracket-editor, п. 2, Андрій 14.11):
// раніше пару можна було лише прибрати й створити заново. Раунд пари не змінюється — пересування
// між місцями раунду окремо (move, Backend). Матчі, уже зіграні між старими командами, живуть
// окремо в Match і тут не чіпаються.
query "bracket/{bracket_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int bracket_id filters=min:1
    int teaminfo_id1?
    int teaminfo_id2?
  
    // true — прибрати другу команду (бай, бриф bracket-bye 17.11); не прислано / 0 / null у teaminfo_id2 — «не чіпати»
    bool clear_teaminfo_id2?
  
    // true — прибрати першу команду (бриф bracket-bye-team1, 19.11); обидві разом прибрати не можна
    bool clear_teaminfo_id1?
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
  
    // Нові команди: що не прийшло — лишається як було; clear_teaminfo_id2 — друга команда null (бай).
    // q2 = -1 замість null — для пошуків: null збігся б з іншими баями раунду.
    api.lambda {
      code = """
          const нова = (v, була) => (v != null && Number(v) > 0 ? Number(v) : (була != null && Number(була) > 0 ? Number(була) : null));
          const t1 = $input.clear_teaminfo_id1 === true ? null : нова($input.teaminfo_id1, $var.pair.teaminfo_id1);
          const t2 = $input.clear_teaminfo_id2 === true ? null : нова($input.teaminfo_id2, $var.pair.teaminfo_id2);
          return { t1: t1, t2: t2, q1: t1 == null ? -1 : t1, q2: t2 == null ? -1 : t2, need: (t1 == null ? 0 : 1) + (t2 == null ? 0 : 1) };
        """
      timeout = 10
    } as $teams
  
    precondition ($teams.need >= 1) {
      error_type = "badrequest"
      error = "У парі має лишитися хоча б одна команда"
    }
  
    precondition ($teams.need < 2 || $teams.t1 != $teams.t2) {
      error_type = "badrequest"
      error = "Команда не може грати сама з собою"
    }
  
    db.query "Tournament participants" {
      where = $db.Tournament_participants.leagues_id == $tour.leagues_id && ($db.Tournament_participants.teaminfo_id == $teams.q1 || $db.Tournament_participants.teaminfo_id == $teams.q2)
      return = {type: "count"}
    } as $participants
  
    precondition ($participants == $teams.need) {
      error_type = "badrequest"
      error = "Команди пари мають бути учасницями турніру"
    }
  
    // Команда не може стояти у двох парах одного раунду
    db.query Bracket {
      where = $db.Bracket.tours_id == $pair.tours_id && $db.Bracket.id != $input.bracket_id && ($db.Bracket.teaminfo_id1 == $teams.q1 || $db.Bracket.teaminfo_id2 == $teams.q1 || $db.Bracket.teaminfo_id1 == $teams.q2 || $db.Bracket.teaminfo_id2 == $teams.q2)
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