query matches verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    timestamp TimeOfMatch
    int team1_id filters=min:1
    int team2_id filters=min:1
    int leagues_id filters=min:1
    int tours_id filters=min:1
    int venues_id filters=min:1
    int match_status_id filters=min:1
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
    precondition ($input.team1_id != $input.team2_id) {
      error_type = "badrequest"
      error = "Команда не може грати сама з собою"
    }

    // Рахунок і статуси «Онлайн» (3) та «Зіграний» (4) з CRM не ставляться.
    // Причина не в правах: рядки турнірної таблиці (`Table`) пише стара логіка
    // Xano всередині POST /match #4 і #5, і лише за умови статус > 2 та етап
    // типу «таблиця». Якщо новий матч створити тут зі статусом 4, рядків
    // таблиці не з'явиться взагалі й турнірна таблиця мовчки розійдеться з
    // результатами. Ведення рахунку — черга 2 ТЗ (docs/proposals/crm-admin-parity.md).
    precondition ($input.match_status_id == 1 || $input.match_status_id == 2) {
      error_type = "badrequest"
      error = "З CRM створюється лише запланований або перенесений матч. Рахунок і статус «Зіграний» поки ведуться в ADMIN"
    }

    db.add Match {
      data = {
        created_at      : "now"
        TimeOfMatch     : $input.TimeOfMatch
        team1_id        : $input.team1_id
        team2_id        : $input.team2_id
        leagues_id      : $input.leagues_id
        tours_id        : $input.tours_id
        venues_id       : $input.venues_id
        match_status_id : $input.match_status_id
        referee1_id     : $input.referee1_id
        referee2_id     : $input.referee2_id
        referee3_id     : $input.referee3_id
        users_idDelegat : $input.users_idDelegat
        VideoID         : $input.VideoID
        Sposterigach_ar : $input.Sposterigach_ar
        timekeeper      : $input.timekeeper
        match_number    : $input.match_number
        num_of_spectators: $input.num_of_spectators
      }
    } as $match
  }

  response = $match
}
