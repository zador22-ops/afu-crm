query "matches/{match_id}" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
  }

  stack {
    db.query Match {
      where = $db.Match.id == $input.match_id
      return = {type: "single"}
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
    } as $match
    precondition ($match != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }
  }

  response = $match
}
