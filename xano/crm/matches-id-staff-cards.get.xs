query "matches/{match_id}/staff-cards" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
  }

  stack {
    // Картки тренерам і адміністраторам живуть в окремій таблиці: вони не
    // впливають ні на рахунок, ні на таблицю, тому й лежать не в Statistic.
    db.query "Statistic Administration of teams" {
      where = $db.Statistic_Administration_of_teams.match_id == $input.match_id
      sort = {Statistic_Administration_of_teams.minute: "asc"}
      return = {type: "list"}
      addon = [
        {
          name  : "Administration_of_teams"
          output: ["id", "people_id", "teaminfo_id", "positions_id"]
          input : {Administration_of_teams_id: $output.administration_of_teams_id}
          addon : [
            {
              name  : "People"
              output: ["prizvushche", "Name"]
              input : {People_id: $output.people_id}
              as    : "_people"
            }
            {
              name  : "Positions"
              output: ["Position"]
              input : {Positions_id: $output.positions_id}
              as    : "_position"
            }
          ]
          as    : "_staff"
        }
        {
          name  : "Types_of_cards"
          output: ["Type"]
          input : {Types_of_cards_id: $output.types_of_cards_id}
          as    : "_card"
        }
      ]
    } as $cards
  }

  response = $cards
}
