query "roster/add" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int player_id filters=min:1
    int teaminfo_id filters=min:1
    int leagues_id filters=min:1
    int Number?=0
    int positions_id filters=min:1
    bool Captain?=false
    date Date
    date prev_end_date?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 5, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $club
    precondition ($club != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }
    db.get People {
      field_name = "id"
      field_value = $input.player_id
    } as $person
    precondition ($person != null) {
      error_type = "notfound"
      error = "Особу не знайдено"
    }

    // Споріднені клуби: сам клуб, його материнський, усі дочірні клубу і материнського
    db.query TeamInfo {
      where = $db.TeamInfo.parent_teaminfo_id == $input.teaminfo_id || $db.TeamInfo.parent_teaminfo_id == $club.parent_teaminfo_id
      return = {type: "list"}
      output = ["id", "parent_teaminfo_id"]
    } as $relatives

    db.query Team {
      where = $db.Team.player_id == $input.player_id && $db.Team.Relevance_of_the_record == true
      return = {type: "list"}
      output = ["id", "teaminfo_id", "Date", "leagues_id"]
    } as $active

    api.lambda {
      code = """
        const target = $var.club.id;
        const parent = $var.club.parent_teaminfo_id || 0;
        const family = new Set([target]);
        if (parent) family.add(parent);
        for (const r of $var.relatives) {
          // без parent у клубу where по parent == null/0 міг зачепити чужі клуби — відсікаємо
          if (r.parent_teaminfo_id === target || (parent && r.parent_teaminfo_id === parent)) family.add(r.id);
        }
        const res = { same: false, conflict: null, close: [], kept: [] };
        for (const row of $var.active) {
          if (row.teaminfo_id === target) { res.same = true; continue; }
          if (family.has(row.teaminfo_id)) { res.kept.push(row.id); continue; }
          if (String(row.Date) >= String($input.Date)) { res.conflict = row; continue; }
          res.close.push(row.id);
        }
        return res;
      """
      timeout = 10
    } as $plan

    precondition ($plan.same == false) {
      error_type = "input"
      error = "Гравець уже в чинному складі цього клубу"
    }
    precondition ($plan.conflict == null) {
      error_type = "input"
      error = "У гравця є чинна заявка в іншому клубі з датою не раніше за нову. Спершу закрийте її."
    }

    foreach ($plan.close) {
      each as $row_id {
        db.edit Team {
          field_name = "id"
          field_value = $row_id
          data = {
            Relevance_of_the_record: false
            End_date               : $input.prev_end_date
          }
        } as $closed
      }
    }

    db.add Team {
      data = {
        created_at             : "now"
        player_id              : $input.player_id
        teaminfo_id            : $input.teaminfo_id
        Number                 : $input.Number
        leagues_id             : $input.leagues_id
        positions_id           : $input.positions_id
        Captain                : $input.Captain
        Date                   : $input.Date
        Relevance_of_the_record: true
      }
    } as $row
  }

  response = {row: $row, closed: $plan.close, kept_parallel: $plan.kept}
}
