query "matches/{match_id}/postpone" verb=POST {
  api_group = "crm"
  auth = "Users"

  // «Онлайн» або «Зіграний» → «Перенесений» (бриф match-postpone-after-start,
  // слово Андрія 19.10). Матч зникає з турнірної таблиці, події протоколу
  // ЛИШАЮТЬСЯ: під час перегравки делегат сам вирішить, продовжити протокол чи
  // видалити зайве. Статистику гравців перенесення не чіпає: події рахуються
  // за будь-якого статусу (слово Андрія 19.10).
  //
  // Окремий ендпоінт, а не ще один статус у /result: перенесення вимагає
  // причини й нічого іншого не міняє, а /result пише рахунок, фоли й перерви.
  // Назад — як із будь-яким перенесеним: нова дата в картці розкладу, «Онлайн»
  // — з протоколу (/result).
  input {
    int match_id filters=min:1
    // Обовʼязкова, ≥ 3 символи. Дописується в Match.other_comments з датою за
    // Києвом. Це поле віддає публічна група Default — без персональних даних.
    text reason? filters=trim
  }

  stack {
    // Право те саме, що для результату: делегат і адмін
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
    precondition ($was.match_status_id != 2) {
      error_type = "badrequest"
      error = "Матч уже перенесений"
    }
    precondition ($was.match_status_id == 3 || $was.match_status_id == 4) {
      error_type = "badrequest"
      error = "Тут переноситься лише матч «Онлайн» або «Зіграний». Запланований — у картці розкладу"
    }

    // «Перенесено 19.10.2026 18:05 (був «Онлайн»): причина» — новим рядком
    // після того, що вже написано; старий коментар не губиться.
    api.lambda {
      code = """
        const причина = String($input.reason || '').trim();
        const d = new Date();
        const день = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Kyiv' });
        const час = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });
        const був = { 3: 'Онлайн', 4: 'Зіграний' }[$var.was.match_status_id];
        const рядок = `Перенесено ${день} ${час} (був «${був}»): ${причина}`;
        const старий = String($var.was.other_comments || '').trim();
        return { reason_ok: причина.length >= 3, comment: старий ? `${старий}\n${рядок}` : рядок };
      """
      timeout = 10
    } as $plan
    precondition ($plan.reason_ok) {
      error_type = "badrequest"
      error = "Вкажіть причину перенесення (щонайменше 3 символи)"
    }

    db.edit Match {
      field_name = "id"
      field_value = $input.match_id
      data = {match_status_id: 2, other_comments: $plan.comment}
    } as $match

    // Статус 2 → рядки таблиці цього матчу видаляються (should = false,
    // may_clear = true). Події не чіпаються.
    function.run "CRM table recalc" {
      input = {match_id: $input.match_id}
    } as $recalc

    // Один пуш «Матч перенесено» (kind match_postponed за статусом 2). «Кінець
    // матчу» тут не піде: функція бере поточний статус, а він уже 2.
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

  response = {match: $match, table: $recalc}
}
