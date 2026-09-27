query "news/{news_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // Правка новини. Змінюються лише передані поля. status тут — лише
  // «draft» (зняти з публікації) чи «archived»; опублікувати — через
  // POST /news/{id}/publish, щоб перевірка обов'язкових полів не оминалась.
  input {
    int news_id filters=min:1
    text title? filters=trim
    text slug? filters=trim|lower
    int category_id?
    text lead? filters=trim
    text body_html?
    text cover_alt? filters=trim
    json gallery?
    text video_url? filters=trim
    int[] tournament_ids?
    int[] club_ids?
    int match_id?
    bool is_featured?
    text status? filters=trim
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
    precondition ($input.title == null || $input.title != "") {
      error_type = "badrequest"
      error = "Заголовок порожній"
    }
    precondition ($input.slug == null || $input.slug != "") {
      error_type = "badrequest"
      error = "Адреса (slug) порожня"
    }
    precondition ($input.status == null || $input.status == "draft" || $input.status == "archived") {
      error_type = "badrequest"
      error = "Тут статус може бути лише «чернетка» або «архів». Опублікувати — кнопкою «Опублікувати»"
    }
    precondition ($input.slug == null || ($input.slug|regex_matches:"/^[a-z0-9]+(-[a-z0-9]+)*$/")) {
      error_type = "badrequest"
      error = "Адреса (slug) — лише малі латинські літери, цифри й дефіси: ekstra-liha-3-tur"
    }
    db.query news {
      where = $db.news.slug == $input.slug && $db.news.id != $input.news_id
      return = {type: "count"}
    } as $dup
    precondition ($input.slug == null || $dup == 0) {
      error_type = "badrequest"
      error = "Новина з такою адресою (slug) уже є — змініть адресу"
    }
    // Захист у глибину: CRM уже чистить текст DOMPurify, сайт чистить під час
    // показу. Тут прибираємо те, що не має потрапити в базу за жодних умов:
    // script/style/object/embed, атрибути on* і style, javascript:-посилання,
    // iframe не з YouTube.
    api.lambda {
      code = """
        let h = $input.body_html;
        if (h === null || h === undefined) return null;
        h = String(h);
        h = h.replace(/<\s*(script|style|object|embed|link|meta|form|input|button|textarea|select)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
        h = h.replace(/<\s*\/?\s*(script|style|object|embed|link|meta|form|input|button|textarea|select)\b[^>]*>/gi, '');
        h = h.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        h = h.replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        h = h.replace(/(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, '$1="#"');
        h = h.replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe>/gi, (m, attrs) => /src\s*=\s*("|')https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/[^"']+\1/i.test(attrs) ? m : '');
        return h;
      """
      timeout = 10
    } as $cleanBody

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw

    // Лише передані ключі; body_html — очищений; службові поля — завжди
    api.lambda {
      code = """
        const keys = Object.keys($var.raw || {}).filter((k) => k !== 'news_id');
        const out = {};
        for (const k of keys) out[k] = $input[k];
        if (keys.includes('body_html')) out.body_html = $var.cleanBody;
        out.updated_at = Date.now();
        out.updated_by = $auth.id;
        return out;
      """
      timeout = 10
    } as $data

    db.patch news {
      field_name = "id"
      field_value = $input.news_id
      data = $data
    } as $item
  }

  response = $item
}
