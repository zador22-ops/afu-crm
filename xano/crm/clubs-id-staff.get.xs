query "clubs/{teaminfo_id}/staff" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int teaminfo_id filters=min:1
    bool all?=false
  }

  stack {
    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id
      sort = {
        Administration_of_teams.Relevance_of_the_record: "desc"
        Administration_of_teams.positions_id           : "asc"
      }
      return = {type: "list"}
      addon = [
        {
          name  : "People"
          output: ["prizvushche", "Name", "po_batkovi", "Date_of_birth", "Photo.url"]
          input : {People_id: $output.people_id}
          as    : "_people"
        }
        {
          name  : "Positions"
          output: ["Position"]
          input : {Positions_id: $output.positions_id}
          as    : "_positions"
        }
      ]
    } as $rows

    api.lambda {
      code = """
        const all = !!$input.all;
        return $var.rows.filter(r => all || r.Relevance_of_the_record === true);
      """
      timeout = 10
    } as $result
  }

  response = $result
}
