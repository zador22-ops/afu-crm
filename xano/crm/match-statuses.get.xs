query "match-statuses" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    db.query Match_status {
      sort = {Match_status.id: "asc"}
      return = {type: "list"}
    } as $statuses
  }

  response = $statuses
}
