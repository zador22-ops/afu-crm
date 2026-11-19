query "tournaments/{leagues_id}/bracket" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int tours_id filters=min:1
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
  
    // Пара може бути з однією командою — бай / вайлд-кард (бриф bracket-bye 17.11, bracket-bye-team1 19.11): будь-яку
    // з команд можна не прислати або ≤ 0 → null, але хоча б одна має бути. q1/q2 = -1 — для пошуку замість null:
    // null збігся б з іншими баями раунду.
    api.lambda {
      code = """
          const ід = (v) => (v != null && Number(v) > 0 ? Number(v) : null);
          const t1 = ід($input.teaminfo_id1), t2 = ід($input.teaminfo_id2);
          return { t1: t1, t2: t2, q1: t1 == null ? -1 : t1, q2: t2 == null ? -1 : t2, need: (t1 == null ? 0 : 1) + (t2 == null ? 0 : 1) };
        """
      timeout = 5
    } as $side2
  
    precondition ($side2.need >= 1) {
      error_type = "badrequest"
      error = "Оберіть хоча б одну команду пари"
    }
  
    precondition ($side2.need < 2 || $side2.t1 != $side2.t2) {
      error_type = "badrequest"
      error = "Команда не може грати сама з собою"
    }
  
    db.get Tours {
      field_name = "id"
      field_value = $input.tours_id
      output = ["id", "leagues_id", "league_stage_id"]
    } as $tour
  
    precondition ($tour != null && $tour.leagues_id == $input.leagues_id) {
      error_type = "badrequest"
      error = "Раунд не належить цьому турніру"
    }
  
    db.get "League stage" {
      field_name = "id"
      field_value = $tour.league_stage_id
      output = ["id", "stage_type"]
    } as $stage
  
    precondition ($stage.stage_type == "сітка") {
      error_type = "badrequest"
      error = "Пари створюються лише в раундах етапу «сітка»"
    }
  
    // Команди пари мають бути учасницями турніру: інакше в сітці зʼявиться
    // клуб, якого в турнірі немає, і це помітять аж на друку.
    db.query "Tournament participants" {
      where = $db.Tournament_participants.leagues_id == $input.leagues_id && ($db.Tournament_participants.teaminfo_id == $side2.q1 || $db.Tournament_participants.teaminfo_id == $side2.q2)
      return = {type: "count"}
    } as $participants
  
    precondition ($participants == $side2.need) {
      error_type = "badrequest"
      error = "Команди пари мають бути учасницями турніру"
    }
  
    // Команда не може стояти у двох парах одного раунду (бриф crm-bracket-editor, як у PATCH пари)
    db.query Bracket {
      where = $db.Bracket.tours_id == $input.tours_id && ($db.Bracket.teaminfo_id1 == $side2.q1 || $db.Bracket.teaminfo_id2 == $side2.q1 || $db.Bracket.teaminfo_id1 == $side2.q2 || $db.Bracket.teaminfo_id2 == $side2.q2)
      return = {type: "count"}
    } as $busy
  
    precondition ($busy == 0) {
      error_type = "badrequest"
      error = "Команда вже стоїть в іншій парі цього раунду"
    }
  
    // Нова пара — останньою в раунді (контракт bracket-position: position = кількість пар туру + 1)
    db.query Bracket {
      where = $db.Bracket.tours_id == $input.tours_id
      return = {type: "count"}
    } as $round_count
  
    api.lambda {
      code = "  return Number($var.round_count || 0) + 1;"
      timeout = 5
    } as $next_position
  
    db.add Bracket {
      data = {
        created_at  : "now"
        tours_id    : $input.tours_id
        teaminfo_id1: $side2.t1
        teaminfo_id2: $side2.t2
        position    : $next_position
      }
    } as $pair
  }

  response = $pair
}