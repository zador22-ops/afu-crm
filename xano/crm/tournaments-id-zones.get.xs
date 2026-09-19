query "tournaments/{leagues_id}/zones" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
  }

  stack {
    db.query league_zone {
      where = $db.league_zone.leagues_id == $input.leagues_id
      sort = {
        league_zone.league_stage_id: "asc"
        league_zone.place_from   : "asc"
      }
      return = {type: "list"}
    } as $zones
  }

  response = $zones
}
