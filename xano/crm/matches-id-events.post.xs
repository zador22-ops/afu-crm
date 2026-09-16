query "matches/{match_id}/events" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    int types_of_match_events_id filters=min:1
    int team_id filters=min:1
    int minute?
    int types_of_goals_id?
    int types_of_cards_id?
    int asustent_team_id?
    int judges_id?
    text reason? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 4, user_id: $auth.id}
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

    // Гравець має бути з однієї з двох команд цього матчу: `Statistic.team_id`
    // ні на що не посилається через матч, тож без цієї перевірки подію можна
    // записати сторонньому клубу, і вона мовчки поїде в його статистику.
    db.get Team {
      field_name = "id"
      field_value = $input.team_id
      output = ["id", "teaminfo_id"]
    } as $row
    precondition ($row != null) {
      error_type = "notfound"
      error = "Гравця у складі не знайдено"
    }
    precondition ($row.teaminfo_id == $match.team1_id || $row.teaminfo_id == $match.team2_id) {
      error_type = "badrequest"
      error = "Гравець не належить жодній із команд цього матчу"
    }
    precondition ($input.types_of_match_events_id != 1 || $input.types_of_goals_id > 0) {
      error_type = "badrequest"
      error = "Для гола вкажіть його тип"
    }
    precondition ($input.types_of_match_events_id != 2 || $input.types_of_cards_id > 0) {
      error_type = "badrequest"
      error = "Для картки вкажіть її колір"
    }

    db.add Statistic {
      data = {
        created_at              : "now"
        match_id                : $input.match_id
        team_id                 : $input.team_id
        types_of_match_events_id: $input.types_of_match_events_id
        types_of_goals_id       : $input.types_of_goals_id
        types_of_cards_id       : $input.types_of_cards_id
        asustent_team_id        : $input.asustent_team_id
        judges_id               : $input.judges_id
        minute                  : $input.minute
        reason                  : $input.reason
      }
    } as $event

    // Рахунок матчу й рядки турнірної таблиці — завжди похідні від подій.
    function.run "CRM table recalc" {
      input = {match_id: $input.match_id}
    } as $recalc
  }

  response = {event: $event, table: $recalc}
}
