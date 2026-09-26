query "tournaments/{leagues_id}/participants" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
  }

  stack {
    db.query "Tournament participants" {
      where = $db.Tournament_participants.leagues_id == $input.leagues_id
      sort = {Tournament_participants.id: "asc"}
      return = {type: "list"}
      addon = [
        {
          name  : "TeamInfo"
          output: ["TeamName", "TeamInfo", "TeamLogo.url", "leagues_id", "parent_teaminfo_id", "Relevance", "team_kind", "country"]
          input : {Teams_id: $output.teaminfo_id}
          as    : "_club"
        }
      ]
    } as $items
  }

  response = $items
}
