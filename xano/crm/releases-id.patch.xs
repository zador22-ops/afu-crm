query "releases/{app_release_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // R57. Виправити текст «що нового», посилання чи дату релізу. Номер версії
  // не змінюється: помилкову версію краще внести новим записом.
  input {
    int app_release_id filters=min:1
    text note? filters=trim
    text store_url? filters=trim
    timestamp released_at?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 12, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.store_url == null || $input.store_url == "" || ($input.store_url|starts_with:"https://")) {
      error_type = "badrequest"
      error = "Посилання має починатися з https://"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch app_release {
      field_name = "id"
      field_value = $input.app_release_id
      data = `$input|pick:($raw|keys)|unset:"app_release_id"`
    } as $row
  }

  response = $row
}
