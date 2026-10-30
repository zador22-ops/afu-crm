query "registration-windows" verb=GET {
  api_group = "crm"
  auth = "Users"

  // «Службове → Заявкові періоди» (самообслуговування клубів, 3.4; контракт
  // 1.1 розділ 2.5). Право 21. Турніри поточного сезону (з all — усі) з їхніми
  // вікнами (registration_window) і прапорцем «склад лише в період»
  // (registration_rule.window_only). Те саме «зараз відкрито / наступне
  // вікно», що бачить клуб у «Складі».
  input {
    bool all?=false
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query Season {
      return = {type: "list"}
      output = ["id", "is_current"]
    } as $seasons
    db.query Leagues {
      return = {type: "list"}
      output = ["id", "League", "season_id", "Relevance"]
    } as $leagues
    db.query registration_window {
      sort = {registration_window.starts_at: "asc"}
      return = {type: "list"}
      output = ["id", "leagues_id", "starts_at", "ends_at", "note", "created_by_users_id"]
    } as $windows
    db.query registration_rule {
      return = {type: "list"}
      output = ["id", "leagues_id", "window_only"]
    } as $rules

    api.lambda {
      code = """
        const зараз = Date.now();
        const сезон = ($var.seasons || []).find((s) => s.is_current);
        const усі = !!$input.all;
        return ($var.leagues || [])
          .filter((l) => усі || (сезон && l.season_id === сезон.id && l.Relevance !== false))
          .map((l) => {
            const вікна = ($var.windows || []).filter((w) => w.leagues_id === l.id)
              .map((w) => ({ id: w.id, starts_at: Number(w.starts_at), ends_at: Number(w.ends_at), note: w.note || null }));
            const лишеУВікні = ($var.rules || []).some((r) => r.leagues_id === l.id && r.window_only === true);
            const відкрите = вікна.some((w) => w.starts_at <= зараз && зараз < w.ends_at);
            const наступне = вікна.map((w) => w.starts_at).filter((t) => t > зараз).sort((a, b) => a - b)[0] || null;
            return { id: l.id, name: l.League, season_id: l.season_id, window_only: лишеУВікні, windows: вікна, open_now: !лишеУВікні || відкрите, next_window_at: лишеУВікні && !відкрите ? наступне : null };
          })
          .sort((a, b) => (b.season_id || 0) - (a.season_id || 0) || String(a.name).localeCompare(String(b.name), 'uk'));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
