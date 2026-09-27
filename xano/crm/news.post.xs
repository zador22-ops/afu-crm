query news verb=POST {
  api_group = "crm"
  auth = "Users"

  // Нова новина — завжди чернетка. Опублікувати — POST /news/{id}/publish,
  // там і перевірка обов'язкових полів.
  input {
    text title filters=trim
    text slug filters=trim|lower
    int category_id?
    text lead? filters=trim
    text body_html?
    text cover_alt? filters=trim
    json gallery?
    text video_url? filters=trim
    int[] tournament_ids?
    int[] club_ids?
    int match_id?
    bool is_featured?=false
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
    precondition ($input.title != "") {
      error_type = "badrequest"
      error = "Заголовок порожній"
    }
    precondition ($input.slug != "") {
      error_type = "badrequest"
      error = "Адреса (slug) порожня"
    }
    // Формат адреси — у JS: фільтр regex_matches XanoScript відхиляв і правильні адреси
    api.lambda {
      code = """
        const s = $input.slug;
        return s === null || s === undefined || s === '' || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(s));
      """
      timeout = 10
    } as $slugOk
    precondition ($slugOk == true) {
      error_type = "badrequest"
      error = "Адреса (slug) — лише малі латинські літери, цифри й дефіси: ekstra-liha-3-tur"
    }
    db.query news {
      where = $db.news.slug == $input.slug && $db.news.id != 0
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

    db.add news {
      data = {
        created_at    : "now"
        updated_at    : "now"
        title         : $input.title
        slug          : $input.slug
        category_id   : $input.category_id
        lead          : $input.lead
        body_html     : $cleanBody
        cover_alt     : $input.cover_alt
        gallery       : $input.gallery
        video_url     : $input.video_url
        tournament_ids: $input.tournament_ids
        club_ids      : $input.club_ids
        match_id      : $input.match_id
        is_featured   : $input.is_featured
        status        : "draft"
        published_at  : $input.published_at
        created_by    : $auth.id
        updated_by    : $auth.id
      }
    } as $item
  }

  response = $item
}
