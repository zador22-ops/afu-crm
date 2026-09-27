query "news-categories" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text name filters=trim
    text slug filters=trim|lower
    int competition_id?
    int sort_order?=0
    bool is_active?=true
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 13, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.name != "") {
      error_type = "badrequest"
      error = "Назва рубрики порожня"
    }
    precondition ($input.slug != "") {
      error_type = "badrequest"
      error = "Адреса рубрики (slug) порожня"
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
      error = "Адреса рубрики (slug) — лише малі латинські літери, цифри й дефіси: ekstra-liha"
    }
    db.query news_category {
      where = $db.news_category.slug == $input.slug && $db.news_category.id != 0
      return = {type: "count"}
    } as $dup
    precondition ($input.slug == null || $dup == 0) {
      error_type = "badrequest"
      error = "Рубрика з такою адресою (slug) уже є"
    }

    db.add news_category {
      data = {
        created_at    : "now"
        updated_at    : "now"
        name          : $input.name
        slug          : $input.slug
        competition_id: $input.competition_id
        sort_order    : $input.sort_order
        is_active     : $input.is_active
      }
    } as $item
  }

  response = $item
}
