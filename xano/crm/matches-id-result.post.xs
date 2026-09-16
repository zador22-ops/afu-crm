query "matches/{match_id}/result" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    // 3 «Онлайн» або 4 «Зіграний». Повернути матч у «Запланований» звідси не
    // можна: це прибрало б рядки таблиці, а такі відкати мають бути свідомими.
    int match_status_id filters=min:1
    // Це НЕ кількість фолів, а прапорці «команда набрала 5 фолів у цьому
    // таймі»: у базі всі чотири поля типу bool. Разом із типом події
    // «Пʼятий фол» (4) це єдиний облік накопичених фолів у системі.
    bool fouls1_team1?
    bool fouls2_team1?
    bool fouls1_team2?
    bool fouls2_team2?
    int minute_break_1_1?
    int minute_break_1_2?
    int minute_break_2_1?
    int minute_break_2_2?
    // Технічний результат: рахунок руками, коли подій немає (неявка, знята
    // команда). Якщо в матчі є події-голи, ці поля ігноруються — рахунок
    // рахується з подій, інакше протокол і таблиця розійшлися б.
    int Result_team1?
    int Result_team2?
    text other_comments? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 2, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.match_status_id == 3 || $input.match_status_id == 4) {
      error_type = "badrequest"
      error = "Статус має бути «Онлайн» або «Зіграний»"
    }

    db.get Match {
      field_name = "id"
      field_value = $input.match_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch Match {
      field_name = "id"
      field_value = $input.match_id
      data = `$input|pick:($raw|keys)|unset:"match_id"`
    } as $match

    // Після зміни статусу рядки таблиці або зʼявляються, або зникають —
    // залежно від статусу й типу етапу. Рахунок перерахунок теж вирівняє.
    function.run "CRM table recalc" {
      input = {match_id: $input.match_id}
    } as $recalc
  }

  response = {match: $match, table: $recalc}
}
