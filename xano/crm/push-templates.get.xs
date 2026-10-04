query "push-templates" verb=GET {
  api_group = "crm"
  auth = "Users"

  // R55. Шаблони пушів для сторінки «Пуші», журнал останніх відправлень і стан
  // запобіжника — одним запитом. Токенів не віддає.
  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 19, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query push_templates {
      sort = {push_templates.sort_order: "asc"}
      return = {type: "list"}
    } as $templates

    db.query push_log {
      sort = {push_log.sent_at: "desc"}
      return = {type: "list", paging: {page: 1, per_page: 100}}
      output = ["id", "kind", "ref", "sent_at", "recipients", "mode", "title", "body"]
    } as $log

    db.get push_config {
      field_name = "id"
      field_value = 1
      output = ["live", "test_tokens"]
    } as $cfg

    api.lambda {
      code = """
        const log = Array.isArray($var.log) ? $var.log : ($var.log && $var.log.items) || [];
        const c = $var.cfg || {};
        return {
          templates: $var.templates || [],
          log,
          live: c.live === true,
          test_phones: Array.isArray(c.test_tokens) ? c.test_tokens.filter(Boolean).length : 0,
        };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
