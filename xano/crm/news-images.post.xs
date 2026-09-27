query "news/images" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Фото для тексту новини й галереї. Повертає адресу й розміри: сайт
  // вимагає width і height у кожного зображення (без стрибків верстки).
  input {
    file image
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 13, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img

    // storage.create_image віддає лише path; адресу добудовуємо так само,
    // як people/search і ADMIN (MakeURL_from_path): база інстансу + path
    api.lambda {
      code = """
        return { ...$var.img, url: 'https://xdeg-kg7i-jjtu.f2.xano.io' + $var.img.path };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
