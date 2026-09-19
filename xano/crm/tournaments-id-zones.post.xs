query "tournaments/{leagues_id}/zones" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int league_stage_id filters=min:1
    text zone_type filters=trim
    int place_from filters=min:1
    int place_to filters=min:1
    text label filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 10, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.zone_type == "playoff" || $input.zone_type == "relegation" || $input.zone_type == "promotion" || $input.zone_type == "europe") {
      error_type = "badrequest"
      error = "Невідомий тип зони"
    }
    // Порожній підпис гірший за відсутність поля: смуга є, а підпис нульової
    // ширини виглядає в застосунку як зламана верстка (Backend, 2026-09-19)
    precondition ($input.label != "") {
      error_type = "badrequest"
      error = "Підпис для легенди обовʼязковий"
    }
    precondition ($input.place_from <= $input.place_to) {
      error_type = "badrequest"
      error = "Перше місце зони має бути не більше за останнє"
    }
    precondition ($input.league_stage_id == 1 || $input.league_stage_id == 2) {
      error_type = "badrequest"
      error = "Етап має бути 1 (таблиця) або 2 (сітка)"
    }

    db.get Leagues {
      field_name = "id"
      field_value = $input.leagues_id
    } as $tournament
    precondition ($tournament != null) {
      error_type = "notfound"
      error = "Турнір не знайдено"
    }

    // Діапазони в межах пари (турнір, етап) не мають перетинатись — інакше
    // одне місце потрапляє одразу у дві смуги (докладніше: crm-model.md, розділ
    // «Зони турнірної таблиці», рішення Backend 2026-09-19)
    db.query league_zone {
      where = $db.league_zone.leagues_id == $input.leagues_id && $db.league_zone.league_stage_id == $input.league_stage_id
      return = {type: "list"}
      output = ["id", "place_from", "place_to", "label"]
    } as $existing

    // Повідомлення складаємо тут-таки, у JS: конкатенація рядка з числом
    // через XanoScript `+` падає з ERROR_FATAL "Not numeric" (перевірено 19.09).
    api.lambda {
      code = """
        const a1 = $input.place_from, b1 = $input.place_to;
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

    db.add league_zone {
      data = {
        created_at     : "now"
        leagues_id     : $input.leagues_id
        league_stage_id: $input.league_stage_id
        zone_type      : $input.zone_type
        place_from     : $input.place_from
        place_to       : $input.place_to
        label          : $input.label
      }
    } as $zone
  }

  response = $zone
}
