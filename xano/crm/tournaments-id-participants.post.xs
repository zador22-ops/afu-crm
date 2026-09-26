query "tournaments/{leagues_id}/participants" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int teaminfo_id filters=min:1
    bool set_main?=true
    int seed?=0
    text group_name? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Leagues {
      field_name = "id"
      field_value = $input.leagues_id
    } as $tournament
    precondition ($tournament != null) {
      error_type = "notfound"
      error = "Турнір не знайдено"
    }
    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $club
    precondition ($club != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }

    db.query "Tournament participants" {
      where = $db.Tournament_participants.leagues_id == $input.leagues_id && $db.Tournament_participants.teaminfo_id == $input.teaminfo_id
      return = {type: "count"}
    } as $dup
    precondition ($dup == 0) {
      error_type = "badrequest"
      error = "Клуб уже серед учасників цього турніру"
    }

    db.add "Tournament participants" {
      data = {
        created_at : "now"
        leagues_id : $input.leagues_id
        teaminfo_id: $input.teaminfo_id
        seed       : $input.seed
        group_name : $input.group_name
        withdrawn  : false
      }
    } as $row

    // Тип змагання турніру: для «міжнародне» головний турнір клубу не міняємо.
    // Інакше український клуб, доданий у ЛЧ, дістав би leagues_id = ЛЧ і
    // зник би з пікерів Екстра-ліги в ADMIN (#121 бере саме TeamInfo.leagues_id).
    db.get league {
      field_name = "id"
      field_value = $tournament.league_id
    } as $competition
    var $mirrorAllowed {
      value = $input.set_main
    }
    conditional {
      if ($competition != null && $competition.type == "міжнародне") {
        var.update $mirrorAllowed {
          value = false
        }
      }
    }
    // Суперникам (збірним і іноземним клубам) leagues_id не ставимо ніколи:
    // порожнє значення тримає їх поза пікерами команд ADMIN (R20)
    conditional {
      if ($club.team_kind != null && $club.team_kind != "") {
        var.update $mirrorAllowed {
          value = false
        }
      }
    }

    // Дзеркало для ADMIN і фан-застосунку: TeamInfo.leagues_id = головний турнір клубу
    conditional {
      if ($mirrorAllowed) {
        db.edit TeamInfo {
          field_name = "id"
          field_value = $input.teaminfo_id
          data = {leagues_id: $input.leagues_id}
        } as $mirror
      }
    }
  }

  response = $row
}
