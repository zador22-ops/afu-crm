query "tournaments/{leagues_id}/tours" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
  }

  stack {
    db.query Tours {
      where = $db.Tours.leagues_id == $input.leagues_id
      sort = {
        tours.league_stage_id: "asc"
        tours.id             : "asc"
      }
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

    db.query Match {
      where = $db.Match.leagues_id == $input.leagues_id
      return = {type: "list"}
      output = ["tours_id"]
    } as $matches

    api.lambda {
      code = """
        const counts = {};
        for (const m of $var.matches) counts[m.tours_id] = (counts[m.tours_id] || 0) + 1;
        return $var.tours.map(t => ({ ...t, matches_count: counts[t.id] || 0 }));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
