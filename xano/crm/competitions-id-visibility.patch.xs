query "competitions/{league_id}/visibility" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // R27: показувати змагання в шторці «Змагання» застосунку чи ні. Окремий
  // ендпоінт, щоб не чіпати чинний PATCH /competitions/{id}. Знято —
  // змагання не показується в шторці й пікерах, його матчі й таблиці лишаються.
  input {
    int league_id filters=min:1
    bool show_in_app
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get league {
      field_name = "id"
      field_value = $input.league_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Змагання не знайдено"
    }

    db.patch league {
      field_name = "id"
      field_value = $input.league_id
      data = {show_in_app: $input.show_in_app}
    } as $item
  }

  response = $item
}
