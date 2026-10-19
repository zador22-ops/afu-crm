query "push-templates/{push_templates_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // R55. Змінити текст пуша чи вимкнути вид. Заголовок і текст не порожні,
  // невідомі {змінні} — 400, щоб у пуш не пішла сира дужка.
  // 16.10: пуші гри (kind game_*) мають свої змінні, різні для кожного виду —
  // їх підставляє розсилка гри (Backend, бриф vluch-push-moderation, Б). Той
  // самий список — у CRM, src/utils/pushVars.js; міняти разом.
  // Резервна копія до цієї правки: xano/backups/push-templates-id.patch.2026-10-16.rollback.xs
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
        const МАТЧ = ['home', 'away', 'competition', 'tour', 'score', 'player', 'team', 'minute', 'half', 'time', 'title', 'lead', 'version', 'store', 'note', 'reason'];
        const ГРА = {
          game_overtaken: ['nick', 'place', 'month_in'],
          game_month_end_soon: ['place', 'target_place', 'gap'],
          game_month_end_soon_leader: ['gap'],
          game_month_result: ['month', 'place', 'players'],
          game_month_winner: ['month', 'score'],
          game_hall_of_fame: ['season'],
          game_nick_reset: [],
        };
        const kind = String(($var.was || {}).kind || '');
        // Невідомий вид гри — жодних змінних: краще 400, ніж сира дужка в пуші
        const ЗМІННІ = kind.startsWith('game_') ? (ГРА[kind] || []) : МАТЧ;
        const raw = $var.raw || {};
        for (const f of ['title_template', 'body_template']) {
          if (!(f in raw)) continue;
          const t = String($input[f] || '').trim();
          if (!t) return { ok: false, message: f === 'title_template' ? 'Заголовок не може бути порожнім' : 'Текст не може бути порожнім' };
          if (t.length > (f === 'title_template' ? 120 : 300)) return { ok: false, message: f === 'title_template' ? 'Заголовок довший за 120 символів' : 'Текст довший за 300 символів' };
          const bad = [...t.matchAll(/\{(\w*)\}/g)].map((m) => m[1]).filter((k) => !ЗМІННІ.includes(k));
          if (bad.length) return { ok: false, message: 'Невідома змінна {' + bad[0] + '}. ' + (ЗМІННІ.length ? 'Можна: ' + ЗМІННІ.map((k) => '{' + k + '}').join(' ') : 'У цьому пуші змінних немає') };
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
