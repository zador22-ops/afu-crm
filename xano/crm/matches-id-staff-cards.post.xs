query "matches/{match_id}/staff-cards" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    int administration_of_teams_id filters=min:1
    int types_of_cards_id filters=min:1
    int minute?
    bool notify?=true
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

    db.get "Administration of teams" {
      field_name = "id"
      field_value = $input.administration_of_teams_id
      output = ["id", "teaminfo_id"]
    } as $row
    precondition ($row != null) {
      error_type = "notfound"
      error = "Члена штабу не знайдено"
    }
    precondition ($row.teaminfo_id == $match.team1_id || $row.teaminfo_id == $match.team2_id) {
      error_type = "badrequest"
      error = "Цей член штабу не належить жодній із команд матчу"
    }

    db.add "Statistic Administration of teams" {
      data = {
        created_at                : "now"
        match_id                  : $input.match_id
        administration_of_teams_id: $input.administration_of_teams_id
        types_of_cards_id         : $input.types_of_cards_id
        minute                    : $input.minute
      }
    } as $card

    // Та сама функція, що й для подій гравців. Мітка `minute: 1001` каже їй
    // шукати людину в штабі, а не у складі — так само робить ADMIN (#203).
    conditional {
      if ($input.notify && $match.match_status_id == 3) {
        function.run PushNotificationsMatchEvents {
          input = {
            match_id                : $input.match_id
            team_id                 : $input.administration_of_teams_id
            types_of_match_events_id: 2
            types_of_cards_id       : $input.types_of_cards_id
            minute                  : 1001
          }
        } as $push
      }
    }
  }

  response = {card: $card, notified: $input.notify && $match.match_status_id == 3}
}
