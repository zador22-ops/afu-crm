query "push-templates/{push_templates_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // R55. Змінити текст пуша чи вимкнути вид. Заголовок і текст не порожні,
  // невідомі {змінні} — 400, щоб у пуш не пішла сира дужка.
  input {
    int push_templates_id filters=min:1
    text title_template? filters=trim
    text body_template? filters=trim
    bool enabled?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 19, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get push_templates {
      field_name = "id"
      field_value = $input.push_templates_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Шаблон не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw

    api.lambda {
      code = """
        const ЗМІННІ = ['home', 'away', 'competition', 'tour', 'score', 'player', 'team', 'minute', 'half', 'time', 'title', 'lead', 'version', 'store', 'note'];
        const raw = $var.raw || {};
        for (const f of ['title_template', 'body_template']) {
          if (!(f in raw)) continue;
          const t = String($input[f] || '').trim();
          if (!t) return { ok: false, message: f === 'title_template' ? 'Заголовок не може бути порожнім' : 'Текст не може бути порожнім' };
          if (t.length > (f === 'title_template' ? 120 : 300)) return { ok: false, message: f === 'title_template' ? 'Заголовок довший за 120 символів' : 'Текст довший за 300 символів' };
          const bad = [...t.matchAll(/\{(\w*)\}/g)].map((m) => m[1]).filter((k) => !ЗМІННІ.includes(k));
          if (bad.length) return { ok: false, message: 'Невідома змінна {' + bad[0] + '}. Можна: ' + ЗМІННІ.map((k) => '{' + k + '}').join(' ') };
        }
        return { ok: true, message: '' };
      """
      timeout = 10
    } as $v
    precondition ($v.ok == true) {
      error_type = "badrequest"
      error = $v.message
    }

    db.patch push_templates {
      field_name = "id"
      field_value = $input.push_templates_id
      data = `$input|pick:($raw|keys)|unset:"push_templates_id"|set:"updated_at":now`
    } as $row
  }

  response = $row
}
