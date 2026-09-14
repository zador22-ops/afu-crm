query "people/{people_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int people_id filters=min:1
    text prizvushche? filters=trim
    text Name? filters=trim
    text po_batkovi? filters=trim
    date Date_of_birth?
    int Growth?
    int Weight?
    text City? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 6, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get People {
      field_name = "id"
      field_value = $input.people_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Особу не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch People {
      field_name = "id"
      field_value = $input.people_id
      data = `$input|pick:($raw|keys)|unset:"people_id"`
    } as $person
  }

  response = $person
}
