query tournaments verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int season_id?
  }

  stack {
    conditional {
      if ($input.season_id > 0) {
        db.query Leagues {
          where = $db.Leagues.season_id == $input.season_id
          sort = {Leagues.id: "desc"}
          return = {type: "list"}
        } as $items
      }
      else {
        db.query Leagues {
          sort = {Leagues.id: "desc"}
          return = {type: "list"}
        } as $items
      }
    }

    db.query "Tournament participants" {
      return = {type: "list"}
      output = ["leagues_id", "teaminfo_id", "withdrawn"]
    } as $participants

    api.lambda {
      code = """
        const counts = {};
        for (const p of $var.participants) {
          if (p.withdrawn) continue;
          counts[p.leagues_id] = (counts[p.leagues_id] || 0) + 1;
        }
        return $var.items.map(t => ({ ...t, participants_count: counts[t.id] || 0 }));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
