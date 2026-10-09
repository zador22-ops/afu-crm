query "game-admin/winners" verb=GET {
  api_group = "crm"
  auth = "Users"

  // Переможці місяців (game_season_winner) і «Зал слави» (game_hall_of_fame) —
  // нові першими. can_redefine — чи ще можна «перевизначити переможця»: 7 днів
  // після закриття місяця, поки його рядки game_month_best ще є.
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

    function.run "Game calendar" {
      input = {}
    } as $cal

    db.query game_season_winner {
      sort = {game_season_winner.month: "desc"}
      return = {type: "list"}
    } as $winners

    db.query game_hall_of_fame {
      sort = {game_hall_of_fame.season: "desc"}
      return = {type: "list"}
    } as $hall

    db.direct_query {
      sql = "SELECT month, COUNT(*) AS n FROM x1_84 GROUP BY month"
      response_type = "list"
    } as $months

    api.lambda {
      code = """
        const рядків = Object.fromEntries(($var.months || []).map((m) => [m.month, Number(m.n)]));
        // Київська північ 1-го числа наступного місяця — так само, як у «Game calendar»
        const кінець = (m) => {
          const [y, mo] = m.split('-').map(Number);
          const ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1;
          const utc = Date.UTC(ny, nm - 1, 1, 0, 0, 0);
          const off = new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })) - new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' }));
          return utc - off;
        };
        const now = Date.now(), DAY = 86400000;
        return {
          now,
          winners: ($var.winners || []).map((w) => {
            const closed = кінець(w.month);
            return { ...w, closed_at: closed, redefine_until: closed + 7 * DAY, can_redefine: now < closed + 7 * DAY && (рядків[w.month] || 0) > 0, month_rows: рядків[w.month] || 0 };
          }),
          hall: $var.hall || [],
        };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
