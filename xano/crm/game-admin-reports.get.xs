query "game-admin/reports" verb=GET {
  api_group = "crm"
  auth = "Users"

  // Скарги на ніки (game_report): нік на момент скарги, поточний нік і чи гравця
  // вже заблоковано, скільки всього скарг на цього гравця. Нові першими.
  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.direct_query {
      sql = """
        SELECT r.id, r.created_at, r.reporter_fans_id, r.target_fans_id, r.nick_snapshot,
               t.game_nick AS current_nick, (t.game_banned IS TRUE) AS banned,
               COUNT(*) OVER (PARTITION BY r.target_fans_id) AS reports_on_target
          FROM x1_87 r
          LEFT JOIN x1_30 t ON t.id = r.target_fans_id
         ORDER BY r.created_at DESC
        """
      response_type = "list"
    } as $rows

    api.lambda {
      code = """
        return ($var.rows || []).map((r) => ({
          id: Number(r.id), created_at: Number(r.created_at),
          reporter_fans_id: r.reporter_fans_id == null ? null : Number(r.reporter_fans_id),
          target_fans_id: r.target_fans_id == null ? null : Number(r.target_fans_id),
          nick_snapshot: r.nick_snapshot ?? null, current_nick: r.current_nick ?? null,
          banned: r.banned === true || r.banned === 't', reports_on_target: Number(r.reports_on_target),
        }));
      """
      timeout = 10
    } as $out
  }

  response = $out
}
