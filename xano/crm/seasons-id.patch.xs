query "seasons/{season_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int season_id filters=min:1
    text name? filters=trim
    date start_date?
    date end_date?
    bool is_current?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Season {
      field_name = "id"
      field_value = $input.season_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Сезон не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch Season {
      field_name = "id"
      field_value = $input.season_id
      data = `$input|pick:($raw|keys)|unset:"season_id"`
    } as $season

    conditional {
      if ($input.is_current) {
        db.query Season {
          where = $db.Season.is_current == true && $db.Season.id != $input.season_id
          return = {type: "list"}
          output = ["id"]
        } as $others
        foreach ($others) {
          each as $item {
            db.edit Season {
              field_name = "id"
              field_value = $item.id
              data = {is_current: false}
            } as $off
          }
        }
      }
    }
  }

  response = $season
}
