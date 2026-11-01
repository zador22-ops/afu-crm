// Чернетка зміни картки клубу (задача 2.1; ТЗ 2.1, контракт 1.1). Клуб надсилає
// форму цілком — сервер лишає в after лише поля, які відрізняються від чинної
// картки, і перевіряє їх. Назву, турнір, материнський клуб і «актуальний»
// змінює лише АФУ — такі поля відхиляються. В основну таблицю нічого не
// пишеться: лише change_request (entity club, action update), open_key
// «club:<id>» — одна відкрита заявка на клуб. Немає відмінностей — чернетка
// прибирається. Заявку на погодженні так не змінити (спершу відкликати, 2.2).
query "club/clubs/{teaminfo_id}/draft" verb=PUT {
  api_group = "crm"
  auth = "club_account"

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
      output = [
        "id"
        "TeamLogo"
        "TeamPhoto"
        "TeamInfo"
        "founded_year"
        "home_venues_id"
        "website"
        "instagram"
        "facebook"
        "youtube"
        "kit_color_primary"
        "kit_color_secondary"
        "contact_name"
        "contact_phone"
        "contact_email"
      ]
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
          ok.comment_ok = String($input.club_comment || '').length <= 1000;
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
  
    precondition ($plan.comment_ok) {
      error_type = "badrequest"
      error = "Коментар — до 1000 знаків"
    }
  
    precondition ($plan.images_ok) {
      error_type = "badrequest"
      error = "Емблему й фото спершу завантажте через форму картки"
    }
  
    // db.get за унікальним open_key: на відсутньому рядку — null (рецензія
    // Backend 30.10; поведінку «single» на порожньому результаті не перевірено)
    db.get change_request {
      field_name = "open_key"
      field_value = $plan.key
      output = ["id", "status", "rev"]
    } as $open
  
    // Булеве — у лямбді: чи обриває XanoScript вираз «null або його поле» на
    // null-обʼєкті, не перевірено (рецензія Backend 30.10, жива перевірка 4а)
    api.lambda {
      code = """
          const o = $var.open;
          return !o || o.status === 'draft';
        """
      timeout = 5
    } as $open_ok
  
    precondition ($open_ok) {
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
  
    // ПЕРЕХОДИ ЧЕРНЕТКИ — CAS v2: замок cr:<id>:<rev> і запис в одній транзакції
    // (UPDATE / DELETE через direct_query у Xano неможливі — x1_93 є view, 0A000).
  
    // Відмінностей не лишилось — чернетка більше не потрібна
    conditional {
      if ($plan.empty && $open != null) {
        // ——— Перехід «delete» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
        // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
        // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
        // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
        // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
        // прибирання своїх ключів у catch уже є.
        api.lambda {
          code = """
              const o = $var.open;
              return { keys: [{ key: 'cr:' + o.id + ':' + (o.rev || 0), op: 'delete', request_id: o.id, batch_id: null }] };
            """
          timeout = 5
        } as $tr_delete
      
        var $mine_delete {
          value = []
        }
      
        var $ok_delete {
          value = false
        }
      
        try_catch {
          try {
            // ТРАНЗАКЦІЯ ↓
            db.transaction {
              stack {
                // ТРАНЗАКЦІЯ ↑
                foreach ($tr_delete.keys) {
                  each as $lk {
                    db.add change_lock {
                      data = {
                        created_at     : "now"
                        key            : $lk.key
                        op             : $lk.op
                        request_id     : $lk.request_id
                        batch_id       : $lk.batch_id
                        users_id       : $acted_by
                        club_account_id: $auth.id
                      }
                    } as $lock_delete
                  
                    var.update $mine_delete {
                      value = $mine_delete|push:$lock_delete.id
                    }
                  }
                }
              
                db.del change_request {
                  field_name = "id"
                  field_value = $open.id
                }
              
                // ТРАНЗАКЦІЯ ↓
              }
            }
          
            // ТРАНЗАКЦІЯ ↑
            var.update $ok_delete {
              value = true
            }
          }
        
          catch {
            // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
            foreach ($mine_delete) {
              each as $mk {
                try_catch {
                  try {
                    db.del change_lock {
                      field_name = "id"
                      field_value = $mk
                    }
                  }
                
                  catch {
                  }
                }
              }
            }
          }
        }
      
        var $held_delete {
          value = []
        }
      
        conditional {
          if ($ok_delete == false) {
            foreach ($tr_delete.keys) {
              each as $hk {
                db.get change_lock {
                  field_name = "key"
                  field_value = $hk.key
                  output = ["id", "op"]
                } as $h
              
                conditional {
                  if ($h != null) {
                    var.update $held_delete {
                      value = $held_delete|push:$hk.key
                    }
                  }
                }
              }
            }
          }
        }
      
        precondition ($ok_delete || ($held_delete|count) == 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
      
        precondition ($ok_delete) {
          error = "Помилка бази — нічого не змінено, спробуйте ще раз"
        }
      }
    }
  
    conditional {
      if (!$plan.empty && $open == null) {
        // Нова чернетка: подвійну не дасть унікальний open_key
        db.add change_request {
          data = {
            created_at       : "now"
            updated_at       : "now"
            teaminfo_id      : $input.teaminfo_id
            club_account_id  : $auth.id
            acted_by_users_id: $acted_by
            entity           : "club"
            action           : "update"
            entity_id        : $input.teaminfo_id
            after            : $plan.after
            status           : "draft"
            open_key         : $plan.key
            target_key       : $plan.key
            club_comment     : $input.club_comment
            rev              : 0
          }
        } as $added
      
        var.update $draft {
          value = $added
        }
      }
    }
  
    conditional {
      if (!$plan.empty && $open != null) {
        // ——— Перехід «edit» — CAS v2 (AFU docs/xano/club-self-service-cas-v2.md) ———
        // Замки change_lock (унікальний key) і записи — в одній транзакції. Конфлікт
        // визначається за станом (чи є ключ) ПОЗА транзакцією, не за текстом помилки.
        // ЗАПАСНИЙ ВАРІАНТ 3.3 (якщо Ж1–Ж2 не пройдуть): прибрати рядки між позначками
        // «ТРАНЗАКЦІЯ ↓» і «ТРАНЗАКЦІЯ ↑» (обгортку db.transaction / stack і її дужки);
        // прибирання своїх ключів у catch уже є.
        api.lambda {
          code = """
              const o = $var.open;
              return { keys: [{ key: 'cr:' + o.id + ':' + (o.rev || 0), op: 'edit', request_id: o.id, batch_id: null }], rev: (o.rev || 0) + 1 };
            """
          timeout = 5
        } as $tr_edit
      
        var $mine_edit {
          value = []
        }
      
        var $ok_edit {
          value = false
        }
      
        try_catch {
          try {
            // ТРАНЗАКЦІЯ ↓
            db.transaction {
              stack {
                // ТРАНЗАКЦІЯ ↑
                foreach ($tr_edit.keys) {
                  each as $lk {
                    db.add change_lock {
                      data = {
                        created_at     : "now"
                        key            : $lk.key
                        op             : $lk.op
                        request_id     : $lk.request_id
                        batch_id       : $lk.batch_id
                        users_id       : $acted_by
                        club_account_id: $auth.id
                      }
                    } as $lock_edit
                  
                    var.update $mine_edit {
                      value = $mine_edit|push:$lock_edit.id
                    }
                  }
                }
              
                db.edit change_request {
                  field_name = "id"
                  field_value = $open.id
                  data = {
                    after            : $plan.after
                    updated_at       : "now"
                    club_account_id  : $auth.id
                    acted_by_users_id: $acted_by
                    club_comment     : $input.club_comment
                    rev              : $tr_edit.rev
                  }
                } as $edited
              
                var.update $draft {
                  value = $edited
                }
              
                // ТРАНЗАКЦІЯ ↓
              }
            }
          
            // ТРАНЗАКЦІЯ ↑
            var.update $ok_edit {
              value = true
            }
          }
        
          catch {
            // Запасний варіант 3.3: свої замки геть — за id СВОГО рядка, не за key (рецензія Backend:
            // за key можна стерти чужий замок, вставлений після відкату); у транзакції id уже відкочено
            foreach ($mine_edit) {
              each as $mk {
                try_catch {
                  try {
                    db.del change_lock {
                      field_name = "id"
                      field_value = $mk
                    }
                  }
                
                  catch {
                  }
                }
              }
            }
          }
        }
      
        var $held_edit {
          value = []
        }
      
        conditional {
          if ($ok_edit == false) {
            foreach ($tr_edit.keys) {
              each as $hk {
                db.get change_lock {
                  field_name = "key"
                  field_value = $hk.key
                  output = ["id", "op"]
                } as $h
              
                conditional {
                  if ($h != null) {
                    var.update $held_edit {
                      value = $held_edit|push:$hk.key
                    }
                  }
                }
              }
            }
          }
        }
      
        precondition ($ok_edit || ($held_edit|count) == 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
      
        precondition ($ok_edit) {
          error = "Помилка бази — нічого не змінено, спробуйте ще раз"
        }
      }
    }
  }

  response = {draft: $draft}
}