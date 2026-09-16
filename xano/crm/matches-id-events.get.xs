query "matches/{match_id}/events" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
  }

  stack {
    // `Statistic.team_id` — це рядок складу (`Team.id`), а не клуб і не гравець.
    // Саме тому голи за «СкайАп-2» не зливаються з голами за «СкайАп».
    db.query Statistic {
      where = $db.Statistic.match_id == $input.match_id
      sort = {
        Statistic.minute: "asc"
        Statistic.id    : "asc"
      }
      return = {type: "list"}
      addon = [
        {
          name  : "Team"
          output: ["id", "player_id", "teaminfo_id", "Number"]
          input : {Team_id: $output.team_id}
          as    : "_team"
        }
        {
          name  : "Team"
          output: ["id", "player_id", "teaminfo_id", "Number"]
          input : {Team_id: $output.asustent_team_id}
          as    : "_assist"
        }
        {
          name  : "Types_of_match_events"
          output: ["Event"]
          input : {Types_of_match_events_id: $output.types_of_match_events_id}
          as    : "_event"
        }
        {
          name  : "Types_of_cards"
          output: ["Type"]
          input : {Types_of_cards_id: $output.types_of_cards_id}
          as    : "_card"
        }
        {
          name  : "Types_of_goals"
          output: ["Type"]
          input : {Types_of_goals_id: $output.types_of_goals_id}
          as    : "_goal"
        }
      ]
    } as $events
  }

  response = $events
}
