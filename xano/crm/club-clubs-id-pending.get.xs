query "club/clubs/{teaminfo_id}/pending" verb=GET {
  api_group = "crm"
  auth = "club_account"

  // Що в клубу не погоджено (задача 2.2): чернетки (ще не надіслані), пакет на
  // погодженні й коли знову можна надіслати (ліміт 1 пакет/год на клуб, ТЗ 6).
  // Лічильники («Картка: 4 зміни · Гравців +3…») CRM рахує з drafts.
  input {
    int teaminfo_id filters=min:1
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
      output = ["id", "entity", "action", "entity_id", "leagues_id", "people_id", "after", "updated_at"]
    } as $drafts
    db.query change_batch {
      where = $db.change_batch.teaminfo_id == $input.teaminfo_id
      sort = {change_batch.submitted_at: "desc"}
      return = {type: "list"}
      output = ["id", "status", "submitted_at", "title", "club_comment"]
    } as $batches
    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && $db.change_request.batch_id != null
      return = {type: "list"}
      output = ["batch_id", "status"]
    } as $batch_rows

    api.lambda {
      code = """
        const ГОДИНА = 3600 * 1000;
        const пакети = $var.batches || [];
        const відкритий = пакети.find((b) => b.status === 'submitted') || null;
        const рядки = ($var.batch_rows || []).filter((r) => відкритий && r.batch_id === відкритий.id);
        // Ліміт рахує надіслані пакети, крім відкликаних (відкликати можна лише до рішення АФУ)
        const останній = пакети.find((b) => b.status !== 'withdrawn');
        const можнаЗ = останній ? Number(останній.submitted_at) + ГОДИНА : null;
        return {
          open_batch: відкритий ? { ...відкритий, rows: рядки.length, decided: рядки.filter((r) => r.status !== 'submitted').length } : null,
          next_submit_at: можнаЗ && можнаЗ > Date.now() ? можнаЗ : null,
        };
      """
      timeout = 10
    } as $state
  }

  response = {drafts: $drafts, open_batch: $state.open_batch, next_submit_at: $state.next_submit_at}
}
