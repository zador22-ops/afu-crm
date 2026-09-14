query "staff/add" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int people_id filters=min:1
    int teaminfo_id filters=min:1
    int positions_id filters=min:1
    int leagues_id?
    date Date
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 5, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $club
    precondition ($club != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }
    db.get People {
      field_name = "id"
      field_value = $input.people_id
    } as $person
    precondition ($person != null) {
      error_type = "notfound"
      error = "Особу не знайдено"
    }

    db.query "Administration of teams" {
      where = $db.Administration_of_teams.people_id == $input.people_id && $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id && $db.Administration_of_teams.positions_id == $input.positions_id && $db.Administration_of_teams.Relevance_of_the_record == true
      return = {type: "count"}
    } as $dup
    precondition ($dup == 0) {
      error_type = "input"
      error = "Ця особа вже на цій посаді в цьому клубі"
    }

    db.add "Administration of teams" {
      data = {
        created_at             : "now"
        people_id              : $input.people_id
        teaminfo_id            : $input.teaminfo_id
        positions_id           : $input.positions_id
        leagues_id             : $input.leagues_id
        Date                   : $input.Date
        Relevance_of_the_record: true
      }
    } as $row
  }

  response = $row
}
