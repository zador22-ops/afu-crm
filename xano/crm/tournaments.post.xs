query tournaments verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text League filters=trim
    text Official_name? filters=trim
    text Short_name? filters=trim
    int season_id filters=min:1
    int league_id filters=min:1
    bool Relevance?=true
    bool main?=false
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.League != "") {
      error_type = "badrequest"
      error = "Назва турніру порожня"
    }

    db.get Season {
      field_name = "id"
      field_value = $input.season_id
    } as $season
    precondition ($season != null) {
      error_type = "badrequest"
      error = "Сезон не знайдено"
    }
    db.get league {
      field_name = "id"
      field_value = $input.league_id
    } as $competition
    precondition ($competition != null) {
      error_type = "badrequest"
      error = "Змагання не знайдено"
    }

    db.add Leagues {
      data = {
        created_at   : "now"
        League       : $input.League
        Official_name: $input.Official_name
        Short_name   : $input.Short_name
        Relevance    : $input.Relevance
        main         : $input.main
        season_id    : $input.season_id
        league_id    : $input.league_id
      }
    } as $tournament

    conditional {
      if ($input.main) {
        db.query Leagues {
          where = $db.Leagues.main == true && $db.Leagues.id != $tournament.id
          return = {type: "list"}
          output = ["id"]
        } as $others
        foreach ($others) {
          each as $item {
            db.edit Leagues {
              field_name = "id"
              field_value = $item.id
              data = {main: false}
            } as $off
          }
        }
      }
    }
  }

  response = $tournament
}
