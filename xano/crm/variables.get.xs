query variables verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    // Сім рядків службових налаштувань. Поле `explanatio` в кожному описує,
    // що саме він робить — це не коментар для розробника, а єдина підказка
    // тому, хто їх правитиме, тому віддаємо його як є.
    db.query Variables {
      sort = {Variables.id: "asc"}
      return = {type: "list"}
    } as $variables
  }

  response = $variables
}
