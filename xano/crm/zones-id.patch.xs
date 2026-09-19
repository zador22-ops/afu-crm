query "zones/{zone_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int zone_id filters=min:1
    text zone_type? filters=trim
    int place_from? filters=min:1
    int place_to? filters=min:1
    text label? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.zone_type == null || $input.zone_type == "playoff" || $input.zone_type == "relegation" || $input.zone_type == "promotion" || $input.zone_type == "europe") {
      error_type = "badrequest"
      error = "Невідомий тип зони"
    }

    db.get league_zone {
      field_name = "id"
      field_value = $input.zone_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Зону не знайдено"
    }

    var $from {
      value = `$input.place_from|default:$was.place_from`
    }
    var $to {
      value = `$input.place_to|default:$was.place_to`
    }
    precondition ($from <= $to) {
      error_type = "badrequest"
      error = "Перше місце зони має бути не більше за останнє"
    }

    // Ті самі перевірки, що й при створенні, лише свій рядок виключено з порівняння
    db.query league_zone {
      where = $db.league_zone.leagues_id == $was.leagues_id && $db.league_zone.league_stage_id == $was.league_stage_id && $db.league_zone.id != $input.zone_id
      return = {type: "list"}
      output = ["id", "place_from", "place_to", "label"]
    } as $existing

    api.lambda {
      code = """
        const a1 = $var.from, b1 = $var.to;
        return $var.existing.find(z => a1 <= z.place_to && z.place_from <= b1) || null;
      """
      timeout = 10
    } as $overlap

    precondition ($overlap == null) {
      error_type = "badrequest"
      error = `"Перетинається із зоною «" + ($overlap.label|default:"без підпису") + "» (" + $overlap.place_from + "–" + $overlap.place_to + ")"`
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch league_zone {
      field_name = "id"
      field_value = $input.zone_id
      data = `$input|pick:($raw|keys)|unset:"zone_id"`
    } as $zone
  }

  response = $zone
}
