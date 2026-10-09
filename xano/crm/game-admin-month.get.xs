query "game-admin/month" verb=GET {
  api_group = "crm"
  auth = "Users"

  // «Влуч у ворота», 4.1. Таблиця місяця для модерації: УСІ рядки, зокрема сховані
  // й заблоковані (з позначками). place — місце серед видимих, тим самим порядком,
  // що в game/leaderboard/month: очки спадають, рівність — раніший achieved_at,
  // далі менший id. Без month — поточний київський місяць («Game calendar»).
  input {
    text month? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    function.run "Game calendar" {
      input = {}
    } as $cal

    var $month {
      value = $input.month == null || $input.month == "" ? $cal.month : $input.month
    }

    db.direct_query {
      sql = """
        SELECT b.id, b.fans_id, f.game_nick AS nick, b.score, b.goals, b.ricochet_goals,
               b.achieved_at, b.games_played, (b.hidden IS TRUE) AS hidden, (f.game_banned IS TRUE) AS banned
          FROM x1_84 b
          LEFT JOIN x1_30 f ON f.id = b.fans_id
         WHERE b.month = ?
         ORDER BY b.score DESC, b.achieved_at ASC, b.id ASC
        """
      response_type = "list"
      arg = $month
    } as $rows

    db.query game_report {
      return = {type: "list"}
      output = ["target_fans_id"]
    } as $reports

    api.lambda {
      code = """
        const скарги = {};
        for (const r of $var.reports || []) скарги[r.target_fans_id] = (скарги[r.target_fans_id] || 0) + 1;
        let місце = 0;
        const rows = ($var.rows || []).map((r) => {
          const hidden = r.hidden === true || r.hidden === 't';
          const banned = r.banned === true || r.banned === 't';
          return {
            id: Number(r.id), fans_id: r.fans_id == null ? null : Number(r.fans_id), nick: r.nick ?? null,
            score: Number(r.score), goals: Number(r.goals), ricochet_goals: Number(r.ricochet_goals),
            achieved_at: Number(r.achieved_at), games_played: Number(r.games_played),
            hidden, banned, place: hidden || banned ? null : ++місце, reports: скарги[r.fans_id] || 0,
          };
        });
        return { month: $var.month, current_month: $var.cal.month, month_ends_at: $var.cal.month_ends_at, players: rows.length, visible: місце, rows };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
