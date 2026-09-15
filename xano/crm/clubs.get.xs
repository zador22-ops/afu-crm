query clubs verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    bool archived?=false
  }

  stack {
    conditional {
      if ($input.archived) {
        db.query TeamInfo {
          sort = {TeamInfo.TeamName: "asc"}
          return = {type: "list"}
          addon = [
            {
              name  : "Leagues"
              output: ["League"]
              input : {Leagues_id: $output.leagues_id}
              as    : "_leagues"
            }
          ]
        } as $clubs
      }
      else {
        db.query TeamInfo {
          where = $db.TeamInfo.Relevance == true
          sort = {TeamInfo.TeamName: "asc"}
          return = {type: "list"}
          addon = [
            {
              name  : "Leagues"
              output: ["League"]
              input : {Leagues_id: $output.leagues_id}
              as    : "_leagues"
            }
          ]
        } as $clubs
      }
    }
  }

  response = $clubs
}
