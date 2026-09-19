query "zones/{zone_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int zone_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get league_zone {
      field_name = "id"
      field_value = $input.zone_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Зону не знайдено"
    }

    db.del league_zone {
      field_name = "id"
      field_value = $input.zone_id
    }
  }

  response = {deleted: 1}
}
