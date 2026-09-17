query "tournaments/{leagues_id}/bracket" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
  }

  stack {
    // Сітка живе парами команд у межах туру: тур тут — це раунд («1/4», «Фінал»).
    // Тури кубка — ті, що в етапі типу «сітка».
    db.query Tours {
      where = $db.Tours.leagues_id == $input.leagues_id
      sort = {Tours.id: "asc"}
      return = {type: "list"}
      addon = [
        {
          name  : "League_stage"
          output: ["stage_name", "stage_type"]
          input : {League_stage_id: $output.league_stage_id}
          as    : "_stage"
        }
      ]
    } as $tours

    db.query Bracket {
      join = {
        Tours: {table: "Tours", where: $db.Tours.id == $db.Bracket.tours_id}
      }

      where = $db.Tours.leagues_id == $input.leagues_id
      sort = {Bracket.id: "asc"}
      return = {type: "list"}
      addon = [
        {
          name  : "TeamInfo"
          output: ["id", "TeamName", "TeamLogo"]
          input : {Teams_id: $output.teaminfo_id1}
          as    : "_team1"
        }
        {
          name  : "TeamInfo"
          output: ["id", "TeamName", "TeamLogo"]
          input : {Teams_id: $output.teaminfo_id2}
          as    : "_team2"
        }
      ]
    } as $pairs

    // Матчі того ж турніру — щоб поруч із парою було видно, чи вона вже
    // зіграна й з яким рахунком. Переможця сітка не зберігає: у Bracket
    // такого поля немає, тож єдине джерело — результат матчу.
    db.query Match {
      where = $db.Match.leagues_id == $input.leagues_id
      return = {type: "list"}
      output = ["id", "team1_id", "team2_id", "tours_id", "Result_team1", "Result_team2", "match_status_id"]
    } as $matches
  }

  response = {tours: $tours, pairs: $pairs, matches: $matches}
}
