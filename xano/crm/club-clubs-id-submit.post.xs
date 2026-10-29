query "club/clubs/{teaminfo_id}/submit" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // «Надіслати на погодження» (задача 2.2; ТЗ 3.2.2, контракт 1.1 п. 2.3–2.4):
  // усі чернетки клубу → submitted в одному пакеті change_batch. Знімок before
  // — на момент ПОДАЧІ: поля основного запису, які змінює заявка (для create —
  // null). Ліміт 1 пакет/год на клуб (ТЗ 6; відкликані не рахуються). Без
  // чернеток нічого не створюється (ТЗ 7.8). В основні таблиці — нічого.
  input {
    int teaminfo_id filters=min:1
    text title? filters=trim
    text club_comment? filters=trim
  }

  stack {
    // СТОРОЖ «лише свій клуб» (контракт 1.1, п. 2.2) — однаковий текст у
    // кожному клубному ендпоінті з teaminfo_id; src/utils/clubGuard.test.js
    // перевіряє, що він є і стоїть до будь-якого читання даних клубу.
    db.get club_account {
      field_name = "id"
      field_value = $auth.id
    } as $guard_account
    precondition ($guard_account != null && $guard_account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }
    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $auth.id && $db.club_account_club.teaminfo_id == $input.teaminfo_id && $db.club_account_club.is_active == true
      return = {type: "count"}
    } as $guard_own
    precondition ($guard_own > 0) {
      error_type = "accessdenied"
      error = "Це не ваш клуб"
    }
    // /СТОРОЖ

    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && $db.change_request.status == "draft"
      sort = {change_request.id: "asc"}
      return = {type: "list"}
      output = ["id", "entity", "action", "entity_id", "after"]
    } as $drafts
    db.query change_batch {
      where = $db.change_batch.teaminfo_id == $input.teaminfo_id && $db.change_batch.status != "withdrawn"
      sort = {change_batch.submitted_at: "desc"}
      return = {type: "list"}
      output = ["id", "submitted_at"]
    } as $recent
    // Основні записи для знімка before (лише читання). Таблиці невеликі —
    // простіше прочитати й відібрати в лямбді, ніж робити запит на кожну заявку
    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $club
    db.query People {
      return = {type: "list"}
    } as $people
    db.query Team {
      where = $db.Team.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
    } as $squad
    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
    } as $staff

    api.lambda {
      code = """
        const ГОДИНА = 3600 * 1000;
        const останній = ($var.recent || [])[0];
        const таблиця = { club: () => [$var.club].filter(Boolean), person: () => $var.people || [], squad_row: () => $var.squad || [], staff_row: () => $var.staff || [] };
        const знімок = (r) => {
          if (r.action === 'create' || r.entity_id == null) return null;
          const рядок = (таблиця[r.entity] ? таблиця[r.entity]() : []).find((x) => x.id === r.entity_id);
          if (!рядок) return null;
          const б = {};
          for (const k of Object.keys(r.after || {})) if (k in рядок) б[k] = рядок[k];
          return б;
        };
        return {
          has_drafts: ($var.drafts || []).length > 0,
          rate_ok: !останній || Date.now() - Number(останній.submitted_at) >= ГОДИНА,
          rows: ($var.drafts || []).map((r) => ({ id: r.id, before: знімок(r) })),
        };
      """
      timeout = 20
    } as $plan

    precondition ($plan.has_drafts) {
      error_type = "badrequest"
      error = "Немає змін для надсилання"
    }
    precondition ($plan.rate_ok) {
      error_type = "badrequest"
      error = "Пакет можна надсилати не частіше разу на годину"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }
    db.add change_batch {
      data = {created_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, title: $input.title, status: "submitted", submitted_at: "now", club_comment: $input.club_comment}
    } as $batch

    foreach ($plan.rows) {
      each as $row {
        db.edit change_request {
          field_name = "id"
          field_value = $row.id
          data = {status: "submitted", batch_id: $batch.id, before: $row.before, updated_at: "now"}
        } as $submitted
      }
    }
  }

  response = {batch: {id: $batch.id, status: $batch.status, submitted_at: $batch.submitted_at}, rows: $plan.rows|count}
}
