query "matches/{match_id}/squad" verb=PUT {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    int teaminfo_id filters=min:1
    // [{team_id, first5}] — рядки складу, заявлені на матч
    json players?
    // [id] — рядки штабу клубу
    json staff?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 3, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Match {
      field_name = "id"
      field_value = $input.match_id
    } as $match
    precondition ($match != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }
    precondition ($input.teaminfo_id == $match.team1_id || $input.teaminfo_id == $match.team2_id) {
      error_type = "badrequest"
      error = "Ця команда не грає в цьому матчі"
    }

    // Склад і штаб клубу — щоб не дати заявити чужого гравця. Перевіряємо всі
    // рядки одразу, а не по одному: заявка приходить списком.
    db.query Team {
      where = $db.Team.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id"]
    } as $roster
    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id"]
    } as $club_staff

    api.lambda {
      code = """
        const ids = (x) => new Set((Array.isArray(x) ? x : []).map((r) => Number(r.id)));
        const свої = ids($var.roster);
        const свійШтаб = ids($var.club_staff);
        const гравці = (Array.isArray($input.players) ? $input.players : []).map((p) => ({
          team_id: Number(p.team_id),
          first5: p.first5 === true || p.first5 === 'true',
        })).filter((p) => p.team_id);
        const штаб = (Array.isArray($input.staff) ? $input.staff : []).map(Number).filter(Boolean);
        return {
          players: гравці,
          staff: штаб,
          // Дублі в списку дали б два рядки заявки на одного гравця
          unique: new Set(гравці.map((p) => p.team_id)).size === гравці.length,
          foreign: гравці.some((p) => !свої.has(p.team_id)) || штаб.some((id) => !свійШтаб.has(id)),
          first5: гравці.filter((p) => p.first5).length,
        };
      """
      timeout = 10
    } as $in

    precondition (!$in.foreign) {
      error_type = "badrequest"
      error = "У заявці є гравець або член штабу з іншого клубу"
    }
    precondition ($in.unique) {
      error_type = "badrequest"
      error = "Один гравець двічі в заявці"
    }
    precondition ($in.first5 <= 5) {
      error_type = "badrequest"
      error = "У стартовій пʼятірці не може бути більше пʼятьох"
    }

    // Заявка зберігається цілком: старі рядки команди зносяться, нові
    // додаються. Так само робить ADMIN (#133) — інакше два джерела правди.
    db.query Zaiuavka {
      join = {
        Team: {table: "Team", where: $db.Team.id == $db.Zaiuavka.team_id}
      }

      where = $db.Zaiuavka.match_id == $input.match_id && $db.Team.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id"]
    } as $prev
    foreach ($prev) {
      each as $row {
        db.del Zaiuavka {
          field_name = "id"
          field_value = $row.id
        }
      }
    }
    foreach ($in.players) {
      each as $p {
        db.add Zaiuavka {
          data = {
            created_at: "now"
            match_id  : $input.match_id
            team_id   : $p.team_id
            First5    : $p.first5
          }
        } as $added
      }
    }

    db.query "Zaiuavka administration of teams" {
      join = {
        Administration_of_teams: {
          table: "Administration of teams"
          where: $db.Zaiuavka_administration_of_teams.administration_of_teams_id == $db.Administration_of_teams.id
        }
      }

      where = $db.Zaiuavka_administration_of_teams.match_id == $input.match_id && $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id"]
    } as $prev_staff
    foreach ($prev_staff) {
      each as $row {
        db.del "Zaiuavka administration of teams" {
          field_name = "id"
          field_value = $row.id
        }
      }
    }
    foreach ($in.staff) {
      each as $sid {
        db.add "Zaiuavka administration of teams" {
          data = {
            created_at                : "now"
            match_id                  : $input.match_id
            administration_of_teams_id: $sid
          }
        } as $added_staff
      }
    }
  }

  response = {players: `$in.players|count`, staff: `$in.staff|count`, first5: $in.first5}
}
