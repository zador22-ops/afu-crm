query "roles/{role_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int role_id filters=min:1
    text Type? filters=trim
    json access_rights_id?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 1, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get "Types of user roles" {
      field_name = "id"
      field_value = $input.role_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Роль не знайдено"
    }

    // Право 1 — це «Редагування Юзерів», тобто доступ до цього самого екрана.
    // Якщо забрати його в ролі, на якій сидиш сам, більше нікому буде вернути
    // права: у Xano це доводилось би правити руками в таблиці.
    db.get Users {
      field_name = "id"
      field_value = $auth.id
      output = ["id", "types_of_user_roles_id"]
    } as $me
    api.lambda {
      code = """
        const rights = Array.isArray($input.access_rights_id) ? $input.access_rights_id.map(Number) : null;
        return {
          given: rights,
          // Саме собі відібрати доступ до керування користувачами не можна
          self_lockout: rights !== null && Number($var.me.types_of_user_roles_id) === Number($input.role_id) && !rights.includes(1),
        };
      """
      timeout = 10
    } as $c
    precondition (!$c.self_lockout) {
      error_type = "badrequest"
      error = "Не можна забрати право «Редагування Юзерів» у власної ролі"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch "Types of user roles" {
      field_name = "id"
      field_value = $input.role_id
      data = `$input|pick:($raw|keys)|unset:"role_id"`
    } as $role
  }

  response = $role
}
