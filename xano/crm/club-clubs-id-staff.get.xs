query "club/clubs/{teaminfo_id}/staff" verb=GET {
  api_group = "crm"
  auth = "club_account"

  // Штаб клубу (задача 3.3; ТЗ 2.3): чинні рядки Administration of teams,
  // посади штабу (не ігрові), відкриті заявки. Особисті дані — лише осіб зі
  // штабу цього клубу та з його заявок.
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

    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["id", "people_id", "positions_id", "leagues_id", "Date", "end_date", "Relevance_of_the_record"]
    } as $rows
    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Name", "po_batkovi", "Date_of_birth", "Photo", "City", "Growth", "Weight"]
    } as $people
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Position", "Player_position"]
    } as $positions
    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && ($db.change_request.status == "draft" || $db.change_request.status == "submitted") && ($db.change_request.entity == "staff_row" || $db.change_request.entity == "person")
      sort = {change_request.id: "asc"}
      return = {type: "list"}
      output = ["id", "entity", "action", "entity_id", "people_id", "depends_on_id", "after", "status"]
    } as $requests

    api.lambda {
      code = """
        const сьогодні = new Date(Date.now()).toISOString().slice(0, 10);
        const особа = new Map(($var.people || []).map((p) => [p.id, p]));
        const посада = new Map(($var.positions || []).map((p) => [p.id, p]));
        const ім = (p) => (p ? [p.prizvushche, p.Name].filter(Boolean).join(' ') : '');
        const відкриті = $var.requests || [];
        const діє = (r) => r.Relevance_of_the_record !== false && (!r.end_date || String(r.end_date) >= сьогодні);
        const штаб = ($var.rows || []).filter(діє).map((r) => {
          const p = особа.get(r.people_id) || {};
          const з = відкриті.find((x) => x.entity === 'staff_row' && x.entity_id === r.id) || null;
          const о = відкриті.find((x) => x.entity === 'person' && x.action === 'update' && x.entity_id === r.people_id) || null;
          return {
            id: r.id, people_id: r.people_id, name: ім(p), prizvushche: p.prizvushche || null, Name: p.Name || null, po_batkovi: p.po_batkovi || null,
            Date_of_birth: p.Date_of_birth || null, City: p.City || null, Growth: p.Growth || null, Weight: p.Weight || null, photo: p.Photo || null,
            positions_id: r.positions_id, position: (посада.get(r.positions_id) || {}).Position || null, Date: r.Date || null,
            request: з ? { id: з.id, status: з.status, action: з.action, after: з.after } : null,
            person_request: о ? { id: о.id, status: о.status, after: о.after } : null,
          };
        }).sort((a, b) => (a.positions_id || 999) - (b.positions_id || 999) || a.name.localeCompare(b.name, 'uk'));
        const новаОсоба = new Map(відкриті.filter((r) => r.entity === 'person' && r.action === 'create').map((r) => [r.id, r]));
        const нові = відкриті.filter((r) => r.entity === 'staff_row' && r.action === 'create').map((r) => {
          const н = r.depends_on_id ? новаОсоба.get(r.depends_on_id) : null;
          const p = r.people_id ? особа.get(r.people_id) : null;
          return {
            request_id: r.id, status: r.status, name: p ? ім(p) : н ? ім(н.after) : '', new_person: !!н,
            positions_id: (r.after || {}).positions_id || null, position: (посада.get((r.after || {}).positions_id) || {}).Position || null,
          };
        });
        return {
          positions: ($var.positions || []).filter((p) => p.Player_position !== true).map((p) => ({ id: p.id, name: p.Position })),
          staff: штаб,
          pending: нові,
        };
      """
      timeout = 20
    } as $staff
  }

  response = $staff
}
