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
    // Та сама причина, що й у POST: рядки `Table` пише стара логіка Xano, якої
    // тут немає. Тому статус «Онлайн»/«Зіграний» з CRM не ставиться, а рахунок
    // не редагується взагалі — інакше таблиця розійдеться з результатами.
    // Решту полів зіграного матчу правити можна: вони на таблицю не впливають.
    precondition ($input.match_status_id == null || $input.match_status_id == 1 || $input.match_status_id == 2) {
      error_type = "badrequest"
      error = "Статус «Онлайн» і «Зіграний» поки ставляться в ADMIN: від них залежать рядки турнірної таблиці"
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
  }

  response = $match
}
