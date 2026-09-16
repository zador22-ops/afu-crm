query "matches/{match_id}/squad" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    int teaminfo_id filters=min:1
  }

  stack {
    // Заявка гравців. `Zaiuavka.team_id` — рядок складу (`Team.id`), тому
    // фільтруємо через join із Team за клубом.
    db.query Zaiuavka {
      join = {
        Team: {table: "Team", where: $db.Team.id == $db.Zaiuavka.team_id}
      }

      where = $db.Zaiuavka.match_id == $input.match_id && $db.Team.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      addon = [
        {
          name  : "Team"
          output: ["id", "player_id", "Number", "positions_id", "Captain"]
          input : {Team_id: $output.team_id}
          addon : [
            {
              name  : "People"
              output: ["prizvushche", "Name", "Photo.url"]
              input : {People_id: $output.player_id}
              as    : "_people"
            }
          ]
          as    : "_team"
        }
      ]
    } as $players

    db.query "Zaiuavka administration of teams" {
      join = {
        Administration_of_teams: {
          table: "Administration of teams"
          where: $db.Zaiuavka_administration_of_teams.administration_of_teams_id == $db.Administration_of_teams.id
        }
      }

      where = $db.Zaiuavka_administration_of_teams.match_id == $input.match_id && $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      addon = [
        {
          name  : "Administration_of_teams"
          output: ["id", "people_id", "positions_id"]
          input : {Administration_of_teams_id: $output.administration_of_teams_id}
          as    : "_staff"
        }
      ]
    } as $staff
  }

  response = {players: $players, staff: $staff}
}
