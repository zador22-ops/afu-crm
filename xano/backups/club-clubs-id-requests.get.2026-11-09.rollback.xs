// Вкладка «Заявки» клубу (задача 2.3; ТЗ 3.2.6, 4.1): надіслані пакети з
// заявками — статус, «було / стане», коментар АФУ. Плюс «виведені
// переходом» (рішення Андрія 8.4): гравці, яких інший клуб забрав
// погодженим переходом. Чернетки тут не показуються — вони в картці й складі.
// Текст збою застосування (apply_error) клубу не віддаємо — він для АФУ.
query "club/clubs/{teaminfo_id}/requests" verb=GET {
  api_group = "crm"
  auth = "club_account"

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
  
    db.query change_batch {
      where = $db.change_batch.teaminfo_id == $input.teaminfo_id
      sort = {change_batch.submitted_at: "desc"}
      return = {type: "list"}
      output = [
        "id"
        "status"
        "submitted_at"
        "withdrawn_at"
        "closed_at"
        "title"
        "club_comment"
        "acted_by_users_id"
      ]
    } as $batches
  
    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && $db.change_request.batch_id != null
      sort = {change_request.id: "asc"}
      return = {type: "list"}
      output = [
        "id"
        "batch_id"
        "entity"
        "action"
        "entity_id"
        "leagues_id"
        "people_id"
        "depends_on_id"
        "transfer_from_teaminfo_id"
        "before"
        "after"
        "status"
        "decision_comment"
        "decided_at"
        "applied_at"
      ]
    } as $rows
  
    db.query change_request {
      where = $db.change_request.transfer_from_teaminfo_id == $input.teaminfo_id && $db.change_request.status == "applied"
      sort = {change_request.applied_at: "desc"}
      return = {type: "list"}
      output = ["id", "teaminfo_id", "people_id", "leagues_id", "applied_at"]
    } as $transfers_out
  
    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Name"]
    } as $people
  
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName"]
    } as $teams
  
    db.query Leagues {
      return = {type: "list"}
      output = ["id", "League"]
    } as $leagues
  
    api.lambda {
      code = """
          const особа = new Map(($var.people || []).map((p) => [p.id, [p.prizvushche, p.Name].filter(Boolean).join(' ')]));
          const клуб = new Map(($var.teams || []).map((t) => [t.id, t.TeamName]));
          const турнір = new Map(($var.leagues || []).map((l) => [l.id, l.League]));
          // Ім'я: наявна особа — з People; нова — з after її person.create
          const нові = new Map(($var.rows || []).filter((r) => r.entity === 'person' && r.action === 'create').map((r) => [r.id, [r.after && r.after.prizvushche, r.after && r.after.Name].filter(Boolean).join(' ')]));
          const ім = (r) => (r.people_id && особа.get(r.people_id)) || (r.depends_on_id && нові.get(r.depends_on_id)) || (r.entity === 'person' && r.entity_id && особа.get(r.entity_id)) || (r.entity === 'person' ? нові.get(r.id) : '') || '';
          const рядки = ($var.rows || []).map((r) => ({
            ...r,
            person_name: ім(r) || null,
            league_name: r.leagues_id ? турнір.get(r.leagues_id) || null : null,
            transfer_from_name: r.transfer_from_teaminfo_id ? клуб.get(r.transfer_from_teaminfo_id) || null : null,
          }));
          return {
            // id співробітника АФУ клубу не потрібен — лише ознака «від імені клубу діяла АФУ»
            batches: ($var.batches || []).map(({ acted_by_users_id, ...b }) => ({ ...b, by_afu: acted_by_users_id != null, requests: рядки.filter((r) => r.batch_id === b.id) })),
            transfers_out: ($var.transfers_out || []).map((t) => ({
              id: t.id,
              applied_at: t.applied_at,
              person_name: особа.get(t.people_id) || null,
              to_club: клуб.get(t.teaminfo_id) || null,
              league_name: t.leagues_id ? турнір.get(t.leagues_id) || null : null,
            })),
          };
        """
      timeout = 10
    } as $history
  }

  response = $history
}