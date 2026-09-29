query "partners/{partner_id}/logo" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Логотип як є, без кадрування: у партнерів логотипи часто широкі
  input {
    int partner_id filters=min:1
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: __RIGHT__, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get partner {
      field_name = "id"
      field_value = $input.partner_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Партнера не знайдено"
    }

    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img

    db.edit partner {
      field_name = "id"
      field_value = $input.partner_id
      data = {logo: $img, updated_at: "now"}
    } as $item
  }

  response = $item
}
