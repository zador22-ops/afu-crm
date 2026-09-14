query seasons verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text name filters=trim
    date start_date?
    date end_date?
    bool is_current?=false
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    precondition ($input.name != "") {
      error_type = "input"
      error = "Назва сезону порожня"
    }

    db.query Season {
      where = $db.Season.name == $input.name
      return = {type: "count"}
    } as $dup
    precondition ($dup == 0) {
      error_type = "input"
      error = "Сезон із такою назвою вже є"
    }

    db.add Season {
      data = {
        created_at: "now"
        name      : $input.name
        start_date: $input.start_date
        end_date  : $input.end_date
        is_current: $input.is_current
      }
    } as $season

    conditional {
      if ($input.is_current) {
        db.query Season {
          where = $db.Season.is_current == true && $db.Season.id != $season.id
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
