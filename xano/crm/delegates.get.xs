query delegates verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    // Делегати — це користувачі з роллю 2. Віддаємо лише id та ім'я:
    // у таблиці Users лежить пароль, і в список він потрапити не має.
    db.query Users {
      where = $db.Users.types_of_user_roles_id == 2 && $db.Users.Relevance == true
      sort = {Users.Name: "asc"}
      return = {type: "list"}
      output = ["id", "Name"]
    } as $delegates
  }

  response = $delegates
}
