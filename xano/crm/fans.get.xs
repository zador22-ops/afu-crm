query fans verb=GET {
  api_group = "crm"
  auth = "Users"

  // Вболівальники застосунку «Футзал AFU» (таблиця Users fans) — лише перегляд.
  // output перелічений явно: одноразовий код входу, push-токен і uuid пристрою
  // не вибираються з бази взагалі. Спосіб
  // входу віддається висновком (google / apple / пошта): google_sub і apple_sub
  // читаються лише в lambda нижче й у відповідь не копіюються.
  input {
    text q? filters=trim
    int page?=1
    int per_page?=50
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 17, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query "Users fans" {
      return = {type: "list"}
      output = ["id", "created_at", "email", "full_name", "latest_activity", "send_notifications", "selected_teaminfo_id", "google_sub", "apple_sub"]
    } as $all

    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName"]
    } as $clubs

    api.lambda {
      code = """
        const q = ($input.q || '').toLowerCase();
        const per = Math.min(Math.max(Number($input.per_page) || 50, 1), 200);
        const page = Math.max(Number($input.page) || 1, 1);
        const clubs = Object.fromEntries(($var.clubs || []).map((c) => [c.id, c.TeamName]));
        const ms = (v) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : Date.parse(v) || 0);
        const now = Date.now();
        const day = 86400000;
        const all = ($var.all || []).map((f) => ({
          id: f.id,
          created_at: f.created_at,
          email: f.email || null,
          full_name: f.full_name || null,
          latest_activity: f.latest_activity || null,
          send_notifications: !!f.send_notifications,
          login: f.google_sub ? 'google' : f.apple_sub ? 'apple' : 'email',
          club: f.selected_teaminfo_id && clubs[f.selected_teaminfo_id] ? { id: f.selected_teaminfo_id, name: clubs[f.selected_teaminfo_id] } : null,
        }));
        const stats = {
          total: all.length,
          new_7: all.filter((f) => now - ms(f.created_at) <= 7 * day).length,
          new_30: all.filter((f) => now - ms(f.created_at) <= 30 * day).length,
          active_30: all.filter((f) => ms(f.latest_activity) && now - ms(f.latest_activity) <= 31 * day).length,
          notifications: all.filter((f) => f.send_notifications).length,
          google: all.filter((f) => f.login === 'google').length,
          apple: all.filter((f) => f.login === 'apple').length,
        };
        const rows = all
          .filter((f) => !q || (f.email || '').toLowerCase().includes(q) || (f.full_name || '').toLowerCase().includes(q))
          .sort((a, b) => ms(b.created_at) - ms(a.created_at));
        return { items: rows.slice((page - 1) * per, page * per), total: rows.length, page, per_page: per, stats };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
