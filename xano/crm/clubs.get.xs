query clubs verb=GET {
  api_group = "crm"
  auth = "Users"

  // kind: порожнє — клуби АФУ (team_kind порожній), «opponents» — суперники
  // збірної і єврокубків (team_kind «збірна» / «іноземний клуб», R20).
  // archived стосується лише клубів: суперники завжди з Relevance = false,
  // щоб не потрапляти в списки й пікери ADMIN.
  input {
    bool archived?=false
    text kind? filters=trim
  }

  stack {
    conditional {
      if ($input.kind == "opponents") {
        db.query TeamInfo {
          where = $db.TeamInfo.team_kind != null && $db.TeamInfo.team_kind != ""
          sort = {TeamInfo.TeamName: "asc"}
          return = {type: "list"}
        } as $clubs
      }
      elseif ($input.archived) {
        db.query TeamInfo {
          where = $db.TeamInfo.team_kind == null || $db.TeamInfo.team_kind == ""
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
          where = $db.TeamInfo.Relevance == true && ($db.TeamInfo.team_kind == null || $db.TeamInfo.team_kind == "")
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
