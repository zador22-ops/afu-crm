query "matches/{match_id}/notify" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    // Рівно ті два рядки, які розуміє PushNotificationsOtherEvents. Інші
    // події (гол, картка) шлються самі при записі в протокол.
    text type_of_event filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 2, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.type_of_event == "finish first half" || $input.type_of_event == "start second half") {
      error_type = "badrequest"
      error = "Подія має бути «finish first half» або «start second half»"
    }

    db.get Match {
      field_name = "id"
      field_value = $input.match_id
    } as $match
    precondition ($match != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }
    // Сповіщення про хід матчу поза живим матчем — це розсилка людям про те,
    // що вже скінчилось. Тому лише статус «Онлайн».
    precondition ($match.match_status_id == 3) {
      error_type = "badrequest"
      error = "Сповіщення надсилаються лише під час матчу зі статусом «Онлайн»"
    }

    function.run PushNotificationsOtherEvents {
      input = {match_id: $input.match_id, type_of_event: $input.type_of_event}
    } as $push
  }

  response = {sent: 1, event: $input.type_of_event}
}
