query "tournaments/{leagues_id}/tours/generate" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int league_stage_id filters=min:1
    int count?=0
    text[] names?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.league_stage_id == 1 || $input.league_stage_id == 2) {
      error_type = "input"
      error = "Етап має бути 1 (таблиця) або 2 (сітка)"
    }

    db.get Leagues {
      field_name = "id"
      field_value = $input.leagues_id
    } as $tournament
    precondition ($tournament != null) {
      error_type = "notfound"
      error = "Турнір не знайдено"
    }

    db.query Tours {
      where = $db.Tours.leagues_id == $input.leagues_id && $db.Tours.league_stage_id == $input.league_stage_id
      return = {type: "list"}
      output = ["TourName"]
    } as $existing

    // Назви: або перелік із запиту (сітка: «1/4 фіналу», «1/2 фіналу», «Фінал»),
    // або «1-й тур … N-й тур» для таблиці. Наявні назви пропускаються.
    api.lambda {
      code = """
        const given = Array.isArray($input.names) ? $input.names.map(s => String(s).trim()).filter(Boolean) : [];
        const n = Number($input.count) || 0;
        const names = given.length ? given : Array.from({ length: n }, (_, i) => `${i + 1}-й тур`);
        const have = new Set($var.existing.map(t => t.TourName));
        return names.filter(x => !have.has(x));
      """
      timeout = 10
    } as $names

    foreach ($names) {
      each as $name {
        db.add Tours {
          data = {
            created_at     : "now"
            TourName       : $name
            leagues_id     : $input.leagues_id
            league_stage_id: $input.league_stage_id
          }
        } as $tour
      }
    }
  }

  response = {created: $names|count, names: $names}
}
