query "clubs/{teaminfo_id}" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int teaminfo_id filters=min:1
  }

  stack {
    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $club
    precondition ($club != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }

    db.query "Tournament participants" {
      where = $db.Tournament_participants.teaminfo_id == $input.teaminfo_id
      sort = {Tournament_participants.leagues_id: "desc"}
      return = {type: "list"}
      addon = [
        {
          name  : "Leagues"
          output: ["League"]
          input : {Leagues_id: $output.leagues_id}
          as    : "_leagues"
        }
      ]
    } as $participations

    db.query TeamInfo {
      where = $db.TeamInfo.parent_teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo.url"]
    } as $children

    db.query Team {
      where = $db.Team.teaminfo_id == $input.teaminfo_id && $db.Team.Relevance_of_the_record == true
      return = {type: "count"}
    } as $roster_count
    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id && $db.Administration_of_teams.Relevance_of_the_record == true
      return = {type: "count"}
    } as $staff_count
  }

  response = {
    club          : $club
    participations: $participations
    children      : $children
    roster_count  : $roster_count
    staff_count   : $staff_count
  }
}
