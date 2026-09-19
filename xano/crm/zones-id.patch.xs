query "zones/{zone_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int zone_id filters=min:1
    text zone_type? filters=trim
    int place_from?
    int place_to?
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
    precondition ($input.label == null || $input.label != "") {
      error_type = "badrequest"
      error = "Підпис для легенди обовʼязковий"
    }
    precondition ($input.place_from == null || $input.place_from >= 1) {
      error_type = "badrequest"
      error = "Перше місце зони має бути не менше 1"
    }
    precondition ($input.place_to == null || $input.place_to >= 1) {
      error_type = "badrequest"
      error = "Останнє місце зони має бути не менше 1"
    }

    db.get league_zone {
      field_name = "id"
      field_value = $input.zone_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Зону не знайдено"
    }

    // `|default:` тут стабільно давав ERROR_FATAL: Invalid pipe — причина не
    // встановлена, XanoScript ADMIN такого фільтра ніде не використовує.
    // Замість нього — підтверджений робочий патерн var + conditional.
    var $from {
      value = $was.place_from
    }
    conditional {
      if ($input.place_from != null) {
        var.update $from {
          value = $input.place_from
        }
      }
    }
    var $to {
      value = $was.place_to
    }
    conditional {
      if ($input.place_to != null) {
        var.update $to {
          value = $input.place_to
        }
      }
    }
    var $zoneType {
      value = $was.zone_type
    }
    conditional {
      if ($input.zone_type != null) {
        var.update $zoneType {
          value = $input.zone_type
        }
      }
    }
    var $labelValue {
      value = $was.label
    }
    conditional {
      if ($input.label != null) {
        var.update $labelValue {
          value = $input.label
        }
      }
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

    // Повідомлення складаємо тут-таки, у JS: конкатенація рядка з числом
    // через XanoScript `+` падає з ERROR_FATAL "Not numeric" (перевірено 19.09).
    api.lambda {
      code = """
        const a1 = $var.from, b1 = $var.to;
        const z = $var.existing.find(z => a1 <= z.place_to && z.place_from <= b1);
        if (!z) return { found: false, message: '' };
        return { found: true, message: `Перетинається із зоною «${z.label}» (${z.place_from}–${z.place_to})` };
      """
      timeout = 10
    } as $overlap

    precondition ($overlap.found == false) {
      error_type = "badrequest"
      error = $overlap.message
    }

    db.patch league_zone {
      field_name = "id"
      field_value = $input.zone_id
      data = {
        zone_type : $zoneType
        place_from: $from
        place_to  : $to
        label     : $labelValue
      }
    } as $zone
  }

  response = $zone
}
