query "matches/{match_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    int leagues_id?
    timestamp TimeOfMatch?
    int team1_id?
    int team2_id?
    int tours_id?
    int venues_id?
    int match_status_id?
    int referee1_id?
    int referee2_id?
    int referee3_id?
    int users_idDelegat?
    text VideoID? filters=trim
    text Sposterigach_ar? filters=trim
    text timekeeper? filters=trim
    int match_number?
    int num_of_spectators?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 2, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Match {
      field_name = "id"
      field_value = $input.match_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }

    // Перенесення матчу в інший турнір ADMIN дозволяє (`League_id` у своїх 25
    // полях), тож дозволяємо і ми — це ж єдиний спосіб прибрати помилково
    // створений матч із живого розкладу: видалення матчу в базі немає взагалі.
    // Статус «Онлайн»/«Зіграний» і рахунок тут не ставляться: для цього є
    // сторінка матчу (POST …/result), яка тримає рядки таблиці рівними подіям.
    // Решту полів зіграного матчу правити можна: вони на таблицю не впливають.
    precondition ($input.match_status_id == null || $input.match_status_id == 1 || $input.match_status_id == 2) {
      error_type = "badrequest"
      error = "Результат і статус — на сторінці матчу: від них залежать рядки турнірної таблиці"
    }

    // Статус матчу «Онлайн»/«Зіграний» звідси не міняється взагалі. Перенести
    // його — кнопкою «Перенести матч» (POST …/postpone): там обовʼязкова
    // причина, і вона лишається в коментарі матчу. Інакше перенесення без
    // причини йшло б в обхід, а відкат у «Запланований» стирав би рядки
    // таблиці мовчки.
    precondition ($input.match_status_id == null || ($was.match_status_id != 3 && $was.match_status_id != 4)) {
      error_type = "badrequest"
      error = "Матч уже онлайн чи зіграний: перенести його можна кнопкою «Перенести матч» на сторінці матчу"
    }

    // Перенесення в інший турнір безпечне лише поки матч не має рядків
    // турнірної таблиці: `Table` тримає власний `leagues_id`, і рядки
    // лишилися б у старому турнірі — обидві таблиці порахувались би
    // неправильно, причому мовчки. Рядки зʼявляються не лише від статусу:
    // гол через старий POST /statistic створює їх навіть у запланованого
    // матчу (admin-app.md 8.1), тому перевіряємо самі рядки, а не статус.
    db.query Table {
      where = $db.Table.match_id == $input.match_id
      return = {type: "count"}
    } as $table_rows
    precondition ($input.leagues_id == null || $table_rows == 0) {
      error_type = "badrequest"
      error = "Матч має рядки турнірної таблиці — перенести його в інший турнір не можна"
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

    // Правка теж може змінити рядки таблиці: повернення статусу в
    // «Запланований» має їх прибрати, зміна туру — перенести в інший етап.
    // Без цього виклику рядки лишились би від попереднього стану.
    function.run "CRM table recalc" {
      input = {match_id: $input.match_id}
    } as $recalc

    // R55: «Змінено час» / «Матч перенесено» тим, хто стежить за командами —
    // лише для запланованого матчу, у якого справді змінився час або статус
    // став «Перенесений». До R55 пушів тут не було (legacy false): поки
    // push_config.live = false, новий формат іде лише на тестові токени.
    conditional {
      if ($match.match_status_id == 2 && $was.match_status_id != 2) {
        // Пуш не має ламати збереження: помилка розсилки не повертається клієнту
        try_catch {
          try {
              function.run "Push v2 match status" {
                input = {match_id: $input.match_id, type_of_event: "status", legacy: false}
              } as $push
          }
          catch {
          }
        }
      }
      elseif ($match.match_status_id == 1 && $match.TimeOfMatch != $was.TimeOfMatch) {
        // Пуш не має ламати збереження: помилка розсилки не повертається клієнту
        try_catch {
          try {
              function.run "Push v2 match status" {
                input = {match_id: $input.match_id, type_of_event: "time_change", legacy: false}
              } as $push
          }
          catch {
          }
        }
      }
    }
  }

  response = $match
}
