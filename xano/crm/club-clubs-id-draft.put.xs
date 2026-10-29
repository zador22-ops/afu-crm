query "club/clubs/{teaminfo_id}/draft" verb=PUT {
  api_group = "crm"
  auth = "club_account"

  // Чернетка зміни картки клубу (задача 2.1; ТЗ 2.1, контракт 1.1). Клуб надсилає
  // форму цілком — сервер лишає в after лише поля, які відрізняються від чинної
  // картки, і перевіряє їх. Назву, турнір, материнський клуб і «актуальний»
  // змінює лише АФУ — такі поля відхиляються. В основну таблицю нічого не
  // пишеться: лише change_request (entity club, action update), open_key
  // «club:<id>» — одна відкрита заявка на клуб. Немає відмінностей — чернетка
  // прибирається. Заявку на погодженні так не змінити (спершу відкликати, 2.2).
  input {
    int teaminfo_id filters=min:1
    json after
    text club_comment? filters=trim
  }

  stack {
    // СТОРОЖ «лише свій клуб» (контракт 1.1, п. 2.2) — однаковий текст у
    // кожному клубному ендпоінті з teaminfo_id; src/utils/clubGuard.test.js
    // перевіряє, що він є і стоїть до будь-якого читання даних клубу.
    db.get club_account {
      field_name = "id"
      field_value = $auth.id
    } as $guard_account
    precondition ($guard_account != null && $guard_account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }
    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $auth.id && $db.club_account_club.teaminfo_id == $input.teaminfo_id && $db.club_account_club.is_active == true
      return = {type: "count"}
    } as $guard_own
    precondition ($guard_own > 0) {
      error_type = "accessdenied"
      error = "Це не ваш клуб"
    }
    // /СТОРОЖ

    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
      output = ["id", "TeamLogo", "TeamPhoto", "TeamInfo", "founded_year", "home_venues_id", "website", "instagram", "facebook", "youtube", "kit_color_primary", "kit_color_secondary", "contact_name", "contact_phone", "contact_email"]
    } as $club
    db.query Venues {
      return = {type: "list"}
      output = ["id"]
    } as $venues

    api.lambda {
      code = """
        const ПОЛЯ = ['TeamLogo', 'TeamPhoto', 'TeamInfo', 'founded_year', 'home_venues_id', 'venue_suggestion', 'website', 'instagram', 'facebook', 'youtube', 'kit_color_primary', 'kit_color_secondary', 'contact_name', 'contact_phone', 'contact_email'];
        const ФОТО = ['TeamLogo', 'TeamPhoto'];
        const вхід = $input.after && typeof $input.after === 'object' && !Array.isArray($input.after) ? $input.after : null;
        const чинне = $var.club || {};
        const рядок = (v) => (v == null ? '' : String(v).trim());
        const шлях = (v) => (v && typeof v === 'object' ? String(v.path || '') : '');
        const після = {};
        const ok = { shape_ok: !!вхід, fields_ok: true, about_ok: true, year_ok: true, venue_ok: true, urls_ok: true, colors_ok: true, email_ok: true, images_ok: true, text_ok: true };
        if (вхід) {
          for (const k of Object.keys(вхід)) if (!ПОЛЯ.includes(k)) ok.fields_ok = false;
          for (const k of ПОЛЯ) {
            if (!(k in (вхід || {}))) continue;
            const v = вхід[k];
            if (ФОТО.includes(k)) {
              if (v == null) continue; // прибрати фото клуб не може — лише замінити
              if (!шлях(v).startsWith('/vault/')) { ok.images_ok = false; continue; }
              if (шлях(v) !== шлях(чинне[k])) після[k] = v;
              continue;
            }
            if (k === 'founded_year') {
              if (рядок(v) === '') { if (чинне[k]) після[k] = null; continue; }
              const р = Number(v);
              if (!Number.isInteger(р) || р < 1850 || р > new Date().getFullYear()) { ok.year_ok = false; continue; }
              if (р !== Number(чинне[k])) після[k] = р;
              continue;
            }
            if (k === 'home_venues_id') {
              if (рядок(v) === '') { if (чинне[k]) після[k] = null; continue; }
              const id = Number(v);
              if (!($var.venues || []).some((a) => a.id === id)) { ok.venue_ok = false; continue; }
              if (id !== Number(чинне[k])) після[k] = id;
              continue;
            }
            const t = рядок(v);
            if (k === 'TeamInfo' && t.length > 2000) ok.about_ok = false;
            if (k !== 'TeamInfo' && t.length > 200) ok.text_ok = false;
            if (['website', 'instagram', 'facebook', 'youtube'].includes(k) && t && !/^https?:\/\/\S+$/i.test(t)) ok.urls_ok = false;
            if (['kit_color_primary', 'kit_color_secondary'].includes(k) && t && !/^#[0-9a-f]{6}$/i.test(t)) ok.colors_ok = false;
            if (k === 'contact_email' && t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) ok.email_ok = false;
            // venue_suggestion — не поле TeamInfo: пропозиція арени для АФУ, у таблицю не пишеться
            if (k === 'venue_suggestion') { if (t) після[k] = t; continue; }
            if (t !== рядок(чинне[k])) після[k] = t || null;
          }
        }
        return { ...ok, after: після, empty: Object.keys(після).length === 0, key: 'club:' + $input.teaminfo_id };
      """
      timeout = 10
    } as $plan

    precondition ($plan.shape_ok) {
      error_type = "badrequest"
      error = "Немає змін картки"
    }
    precondition ($plan.fields_ok) {
      error_type = "badrequest"
      error = "Назву, турнір, материнський клуб і позначку «актуальний» змінює лише АФУ"
    }
    precondition ($plan.about_ok) {
      error_type = "badrequest"
      error = "«Про клуб» — до 2000 знаків"
    }
    precondition ($plan.text_ok) {
      error_type = "badrequest"
      error = "Задовгий текст у полі (до 200 знаків)"
    }
    precondition ($plan.year_ok) {
      error_type = "badrequest"
      error = "Рік заснування — від 1850 до поточного"
    }
    precondition ($plan.venue_ok) {
      error_type = "badrequest"
      error = "Такої арени немає в списку. Запропонуйте її текстом — АФУ додасть"
    }
    precondition ($plan.urls_ok) {
      error_type = "badrequest"
      error = "Посилання на сайт і соцмережі мають починатися з https://"
    }
    precondition ($plan.colors_ok) {
      error_type = "badrequest"
      error = "Колір форми — у вигляді #1A2B3C"
    }
    precondition ($plan.email_ok) {
      error_type = "badrequest"
      error = "Перевірте пошту контактної особи"
    }
    precondition ($plan.images_ok) {
      error_type = "badrequest"
      error = "Емблему й фото спершу завантажте через форму картки"
    }

    db.query change_request {
      where = $db.change_request.open_key == $plan.key
      return = {type: "single"}
      output = ["id", "status"]
    } as $open
    precondition ($open == null || $open.status == "draft") {
      error_type = "badrequest"
      error = "Зміни картки вже на погодженні — дочекайтесь рішення АФУ або відкличте пакет"
    }

    // Адмін «як клуб» — у заявці видно, хто з АФУ діяв (лише через |get: при
    // звичайному вході extras порожні)
    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    var $draft {
      value = null
    }

    // Відмінностей не лишилось — чернетка більше не потрібна
    conditional {
      if ($plan.empty && $open != null) {
        db.del change_request {
          field_name = "id"
          field_value = $open.id
        }
      }
    }
    conditional {
      if (!$plan.empty && $open == null) {
        db.add change_request {
          data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "club", action: "update", entity_id: $input.teaminfo_id, after: $plan.after, status: "draft", open_key: $plan.key, target_key: $plan.key, club_comment: $input.club_comment}
        } as $added
        var.update $draft {
          value = $added
        }
      }
    }
    conditional {
      if (!$plan.empty && $open != null) {
        db.edit change_request {
          field_name = "id"
          field_value = $open.id
          data = {updated_at: "now", club_account_id: $auth.id, acted_by_users_id: $acted_by, after: $plan.after, club_comment: $input.club_comment}
        } as $edited
        var.update $draft {
          value = $edited
        }
      }
    }
  }

  response = {draft: $draft}
}
