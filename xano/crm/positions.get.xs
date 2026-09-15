query positions verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    db.query Positions {
      sort = {Positions.id: "asc"}
      return = {type: "list"}
    } as $positions
    db.query Venues {
      sort = {Venues.City: "asc"}
      return = {type: "list"}
    } as $venues
  }

  response = {positions: $positions, venues: $venues}
}
