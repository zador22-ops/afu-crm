query "tournaments/{leagues_id}/bracket" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int tours_id filters=min:1
    int teaminfo_id1 filters=min:1
    int teaminfo_id2 filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 9, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.teaminfo_id1 != $input.teaminfo_id2) {
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

    // Обидві команди мають бути учасницями турніру: інакше в сітці зʼявиться
    // клуб, якого в турнірі немає, і це помітять аж на друку.
    db.query "Tournament participants" {
      where = $db.Tournament_participants.leagues_id == $input.leagues_id && ($db.Tournament_participants.teaminfo_id == $input.teaminfo_id1 || $db.Tournament_participants.teaminfo_id == $input.teaminfo_id2)
      return = {type: "count"}
    } as $participants
    precondition ($participants == 2) {
      error_type = "badrequest"
      error = "Обидві команди мають бути учасницями турніру"
    }

    db.add Bracket {
      data = {
        created_at  : "now"
        tours_id    : $input.tours_id
        teaminfo_id1: $input.teaminfo_id1
        teaminfo_id2: $input.teaminfo_id2
      }
    } as $pair
  }

  response = $pair
}
