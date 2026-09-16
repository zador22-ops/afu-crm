query venues verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    db.query Venues {
      sort = {Venues.City: "asc"}
      return = {type: "list"}
    } as $venues
  }

  response = $venues
}
