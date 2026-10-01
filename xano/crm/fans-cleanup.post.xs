query "fans/cleanup" verb=POST {
  api_group = "crm"
  auth = "Users"

  // Очистка мертвих анонімних профілів пристрою (R38). Під критерій потрапляє
  // лише профіль без email, без Google і без Apple, що не відкривав застосунок
  // понад days днів (не менше 90). Без confirm — тільки підрахунок. Видалення —
  // лише з confirm=true і expected, що дорівнює підрахунку: якщо за час між
  // переглядом і кліком число змінилось, сервер відмовить.
  // Якщо людина все ж повернеться, застосунок сам заведе їй новий профіль.
  input {
    int days?=90
    bool confirm?=false
    int expected?=0
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 1, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query "Users fans" {
      return = {type: "list"}
      output = ["id", "email", "google_sub", "apple_sub", "latest_activity", "send_notifications"]
    } as $all

    api.lambda {
      code = """
        const days = Number($input.days) || 90;
        if (days < 90) return { ok: false, message: 'Межа — не менше 90 днів', ids: [], days, with_notifications: 0 };
        const edge = Date.now() - days * 86400000;
        const old = ($var.all || []).filter((f) => {
          if (f.email || f.google_sub || f.apple_sub) return false;
          const t = f.latest_activity ? Date.parse(f.latest_activity) : 0;
          return t > 0 && t < edge;
        });
        return { ok: true, message: '', ids: old.map((f) => f.id), days, with_notifications: old.filter((f) => f.send_notifications).length };
      """
      timeout = 10
    } as $plan

    precondition ($plan.ok == true) {
      error_type = "badrequest"
      error = $plan.message
    }

    conditional {
      if ($input.confirm) {
        precondition (($plan.ids|count) == $input.expected) {
          error_type = "badrequest"
          error = "Кількість профілів змінилась — оновіть сторінку й перевірте ще раз"
        }
        foreach ($plan.ids) {
          each as $id {
            db.del "Users fans" {
              field_name = "id"
              field_value = $id
            }
          }
        }
      }
    }
  }

  response = {count: $plan.ids|count, with_notifications: $plan.with_notifications, days: $plan.days, deleted: $input.confirm}
}
