query seasons verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    db.query Season {
      sort = {season.id: "desc"}
      return = {type: "list"}
    } as $seasons
  }

  response = $seasons
}
