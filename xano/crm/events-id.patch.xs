query "events/{statistic_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int statistic_id filters=min:1
    int types_of_match_events_id?
    int team_id?
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

    db.get Statistic {
      field_name = "id"
      field_value = $input.statistic_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Подію не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    // «Не забитий» після зміни — лише з типом «Пенальті» (3) або «Дабл пенальті» (4).
    // Перевіряється стан ПІСЛЯ зміни: старий незабитий із 0 при будь-якій правці
    // вимагає вказати тип (бриф afu-chat-dooprats-2026-11-07, п. 1)
    api.lambda {
      code = """
        const надіслано = (k) => Object.prototype.hasOwnProperty.call($var.raw || {}, k);
        const подія = Number(надіслано('types_of_match_events_id') ? $input.types_of_match_events_id : $var.was.types_of_match_events_id);
        const тип = Number(надіслано('types_of_goals_id') ? $input.types_of_goals_id : $var.was.types_of_goals_id);
        return подія !== 3 || тип === 3 || тип === 4;
      """
      timeout = 5
    } as $penalty_ok
    precondition ($penalty_ok) {
      error_type = "badrequest"
      error = "Для незабитого вкажіть: пенальті чи дабл пенальті"
    }
    db.patch Statistic {
      field_name = "id"
      field_value = $input.statistic_id
      data = `$input|pick:($raw|keys)|unset:"statistic_id"`
    } as $event

    function.run "CRM table recalc" {
      input = {match_id: $was.match_id}
    } as $recalc
  }

  response = {event: $event, table: $recalc}
}
