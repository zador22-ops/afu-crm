query "news/{news_id}/cover" verb=POST {
  api_group = "crm"
  auth = "Users"

  // thumb — мініатюра до 400 px для списків (сайт і застосунок); CRM робить
  // її сама в браузері з того самого файлу
  input {
    int news_id filters=min:1
    file image
    file? thumb
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 13, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get news {
      field_name = "id"
      field_value = $input.news_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Новину не знайдено"
    }

    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img

    db.edit news {
      field_name = "id"
      field_value = $input.news_id
      data = {cover: $img, cover_thumb: null, updated_at: "now", updated_by: $auth.id}
    } as $item

    conditional {
      if ($input.thumb != null) {
        storage.create_image {
          value = $input.thumb
          access = "public"
          filename = ""
        } as $thumb
        db.edit news {
          field_name = "id"
          field_value = $input.news_id
          data = {cover_thumb: $thumb}
        } as $item
      }
    }
  }

  response = $item
}
