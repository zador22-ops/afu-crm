query matches verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int tours_id?=0
  }

  stack {
    conditional {
      if ($input.tours_id > 0) {
        db.query Match {
          where = $db.Match.leagues_id == $input.leagues_id && $db.Match.tours_id == $input.tours_id
          sort = {Match.TimeOfMatch: "asc"}
          return = {type: "list"}
          addon = [
            {
              name  : "TeamInfo"
              output: ["id", "TeamName", "TeamLogo"]
              input : {Teams_id: $output.team1_id}
              as    : "_team1"
            }
            {
              name  : "TeamInfo"
              output: ["id", "TeamName", "TeamLogo"]
              input : {Teams_id: $output.team2_id}
              as    : "_team2"
            }
            {
              name  : "Match_status"
              output: ["Status"]
              input : {Match_status_id: $output.match_status_id}
              as    : "_status"
            }
            {
              name  : "Tours"
              output: ["TourName"]
              input : {Tours_id: $output.tours_id}
              as    : "_tour"
            }
          ]
        } as $matches
      }
      else {
        db.query Match {
          where = $db.Match.leagues_id == $input.leagues_id
          sort = {Match.TimeOfMatch: "asc"}
          return = {type: "list"}
          addon = [
            {
              name  : "TeamInfo"
              output: ["id", "TeamName", "TeamLogo"]
              input : {Teams_id: $output.team1_id}
              as    : "_team1"
            }
            {
              name  : "TeamInfo"
              output: ["id", "TeamName", "TeamLogo"]
              input : {Teams_id: $output.team2_id}
              as    : "_team2"
            }
            {
              name  : "Match_status"
              output: ["Status"]
              input : {Match_status_id: $output.match_status_id}
              as    : "_status"
            }
            {
              name  : "Tours"
              output: ["TourName"]
              input : {Tours_id: $output.tours_id}
              as    : "_tour"
            }
          ]
        } as $matches
      }
    }
  }

  response = $matches
}
