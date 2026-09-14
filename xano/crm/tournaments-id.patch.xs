query "tournaments/{leagues_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    text League? filters=trim
    text Official_name? filters=trim
    text Short_name? filters=trim
    int season_id?
    int league_id?
    bool Relevance?
    bool main?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Leagues {
      field_name = "id"
      field_value = $input.leagues_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Турнір не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch Leagues {
      field_name = "id"
      field_value = $input.leagues_id
      data = `$input|pick:($raw|keys)|unset:"leagues_id"`
    } as $tournament

    conditional {
      if ($input.main) {
        db.query Leagues {
          where = $db.Leagues.main == true && $db.Leagues.id != $input.leagues_id
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
