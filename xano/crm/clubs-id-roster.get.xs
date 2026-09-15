query "clubs/{teaminfo_id}/roster" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int teaminfo_id filters=min:1
    int leagues_id?
    bool all?=false
  }

  stack {
    db.query Team {
      where = $db.Team.teaminfo_id == $input.teaminfo_id
      sort = {
        Team.Relevance_of_the_record: "desc"
        Team.Number                 : "asc"
      }
      return = {type: "list"}
      addon = [
        {
          name  : "People"
          output: ["prizvushche", "Name", "po_batkovi", "Date_of_birth", "Photo.url"]
          input : {People_id: $output.player_id}
          as    : "_people"
        }
        {
          name  : "Positions"
          output: ["Position"]
          input : {Positions_id: $output.positions_id}
          as    : "_positions"
        }
        {
          name  : "Leagues"
          output: ["League"]
          input : {Leagues_id: $output.leagues_id}
          as    : "_leagues"
        }
      ]
    } as $rows

    // Фільтр на боці функції: за сезоном і/або лише чинні
    api.lambda {
      code = """
        const lid = Number($input.leagues_id) || 0;
        const all = !!$input.all;
        return $var.rows.filter(r =>
          (lid === 0 || r.leagues_id === lid) &&
          (all || r.Relevance_of_the_record === true)
        );
      """
      timeout = 10
    } as $result
  }

  response = $result
}
