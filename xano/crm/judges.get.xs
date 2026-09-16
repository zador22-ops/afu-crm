query judges verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    bool archived?=false
  }

  stack {
    conditional {
      if ($input.archived) {
        db.query Judges {
          sort = {
            Judges.prizvushche: "asc"
            Judges.Name       : "asc"
          }
          return = {type: "list"}
        } as $judges
      }
      else {
        db.query Judges {
          where = $db.Judges.Relevance == true
          sort = {
            Judges.prizvushche: "asc"
            Judges.Name       : "asc"
          }
          return = {type: "list"}
        } as $judges
      }
    }
  }

  response = $judges
}
