query client_errors verb=GET {
  api_group = "crm"
  auth = "Users"

  // R56. Помилки застосунку вболівальника, згруповані за текстом. Лише читання.
  input {
    text platform? filters=trim
    text app_version? filters=trim
    // за скільки днів; 0 — за весь час
    int days?=30
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 18, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query client_errors {
      sort = {client_errors.created_at: "desc"}
      return = {type: "list"}
      output = ["id", "created_at", "message", "stack", "screen", "app_version", "build", "platform", "os_version", "is_fatal", "at"]
    } as $rows

    api.lambda {
      code = """
        const list = Array.isArray($var.rows) ? $var.rows : ($var.rows && $var.rows.items) || [];
        const days = Number($input.days) || 0;
        const edge = days > 0 ? Date.now() - days * 86400000 : 0;
        const p = $input.platform || '', v = $input.app_version || '';
        const rows = list.filter((r) => (!edge || r.created_at >= edge) && (!p || r.platform === p) && (!v || r.app_version === v));
        const g = new Map();
        for (const r of rows) {
          const k = r.message || '—';
          if (!g.has(k)) g.set(k, { message: k, count: 0, fatal: 0, first_at: r.created_at, last_at: r.created_at, platforms: {}, versions: {}, screens: {}, stack: r.stack || null, recent: [] });
          const x = g.get(k);
          x.count++;
          if (r.is_fatal) x.fatal++;
          x.first_at = Math.min(x.first_at, r.created_at);
          x.last_at = Math.max(x.last_at, r.created_at);
          const inc = (o, key) => { if (key) o[key] = (o[key] || 0) + 1; };
          inc(x.platforms, r.platform); inc(x.versions, r.app_version); inc(x.screens, r.screen);
          if (x.recent.length < 10) x.recent.push({ id: r.id, created_at: r.created_at, at: r.at, platform: r.platform, app_version: r.app_version, build: r.build, os_version: r.os_version, screen: r.screen, is_fatal: !!r.is_fatal });
        }
        const groups = [...g.values()].sort((a, b) => b.last_at - a.last_at);
        const versions = [...new Set(list.map((r) => r.app_version).filter(Boolean))].sort().reverse();
        return { total: rows.length, fatal: rows.filter((r) => r.is_fatal).length, groups, versions };
      """
      timeout = 15
    } as $out
  }

  response = $out
}
