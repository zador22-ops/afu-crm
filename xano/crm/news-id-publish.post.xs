query "news/{news_id}/publish" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Опублікувати. Дата: передана (майбутня = відкладена публікація), інакше
  // та, що вже стоїть, інакше зараз. Перевіряємо поля, без яких новина на
  // сайті виглядатиме зламаною.
  input {
    int news_id filters=min:1
    timestamp published_at?
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

    api.lambda {
      code = """
        const n = $var.was;
        const miss = [];
        if (!n.title) miss.push('заголовок');
        if (!n.slug) miss.push('адреса (slug)');
        if (!n.category_id) miss.push('рубрика');
        if (!n.lead) miss.push('анонс');
        if (!n.body_html || !String(n.body_html).replace(/<[^>]*>/g, '').trim()) miss.push('текст');
        if (n.cover && !n.cover_alt) miss.push('опис обкладинки');
        const when = $input.published_at || n.published_at || Date.now();
        return { ok: miss.length === 0, message: miss.length ? 'Щоб опублікувати, заповніть: ' + miss.join(', ') : '', when };
      """
      timeout = 10
    } as $check
    precondition ($check.ok == true) {
      error_type = "badrequest"
      error = $check.message
    }

    db.patch news {
      field_name = "id"
      field_value = $input.news_id
      data = {status: "published", published_at: $check.when, updated_at: "now", updated_by: $auth.id}
    } as $item
  }

  response = $item
}
