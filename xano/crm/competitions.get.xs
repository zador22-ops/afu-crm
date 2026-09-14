query competitions verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    db.query league {
      sort = {
        league.sort_order: "asc"
        league.id        : "asc"
      }
      return = {type: "list"}
    } as $items
  }

  response = $items
}
