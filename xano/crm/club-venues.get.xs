query "club/venues" verb=GET {
  api_group = "crm"
  auth = "club_account"

  // Арени для вибору домашньої арени в картці клубу (задача 2.1). Лише назва:
  // той самий рядок, що на сайті й у застосунку. Нової арени тут немає —
  // клуб пропонує її текстом, заводить АФУ (ТЗ 2.1).
  input {
  }

  stack {
    db.get club_account {
      field_name = "id"
      field_value = $auth.id
    } as $account
    precondition ($account != null && $account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }

    db.query Venues {
      sort = {Venues.City: "asc"}
      return = {type: "list"}
      output = ["id", "City"]
    } as $venues
  }

  response = $venues
}
