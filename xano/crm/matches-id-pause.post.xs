query "matches/{match_id}/pause" verb=POST {
  api_group = "crm"
  auth = "Users"

  // «Онлайн» → «Призупинено» (статус 5; бриф match-pause-and-note, слово
  // Андрія 19.10): матч стоїть, наприклад, через повітряну тривогу. На таблицю
  // це не впливає: статус 5 > 2, рядки лишаються з рахунком на момент паузи.
  // Далі — «Відновити» чи «Завершити» (POST …/result з 3 чи 4) або «Перенести»
  // (POST …/postpone). У «Запланований» з 5 не можна ніде.
  input {
    int match_id filters=min:1
    // Обовʼязкова, ≥ 3 символи. Іде в Match.status_note — її бачать
    // уболівальники — і з датою в other_comments. Без персональних даних.
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
    precondition ($was.match_status_id != 5) {
      error_type = "badrequest"
      error = "Матч уже призупинено"
    }
    precondition ($was.match_status_id == 3) {
      error_type = "badrequest"
      error = "Призупинити можна лише матч «Онлайн»"
    }

    // «Призупинено 19.10.2026 18:05: причина» — новим рядком після того, що
    // вже написано; старий коментар не губиться.
    api.lambda {
      code = """
        const причина = String($input.reason || '').trim();
        const d = new Date();
        const день = d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Kyiv' });
        const час = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });
        const рядок = `Призупинено ${день} ${час}: ${причина}`;
        const старий = String($var.was.other_comments || '').trim();
        return { reason_ok: причина.length >= 3, note: причина, comment: старий ? `${старий}\n${рядок}` : рядок };
      """
      timeout = 10
    } as $plan
    precondition ($plan.reason_ok) {
      error_type = "badrequest"
      error = "Вкажіть причину призупинення (щонайменше 3 символи)"
    }

    db.edit Match {
      field_name = "id"
      field_value = $input.match_id
      data = {match_status_id: 5, status_note: $plan.note, other_comments: $plan.comment}
    } as $match

    // Рядки таблиці лишаються (5 > 2); перерахунок лише вирівнює рахунок із подіями
    function.run "CRM table recalc" {
      input = {match_id: $input.match_id}
    } as $recalc

    // «⏸ Матч призупинено · причина» (kind match_paused за статусом 5).
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
