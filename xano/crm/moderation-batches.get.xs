query "moderation/batches" verb=GET {
  api_group = "crm"
  auth = "Users"

  // «Погодження» — список пакетів заявок клубів (4.1). Право 21. Стан пакета —
  // за рядками: open — є рядок submitted; done — рішення по всіх; withdrawn —
  // відкликаний без рішень. Фільтри: клуб, тип (entity рядків).
  input {
    text state?=open filters=trim
    int teaminfo_id?
    text entity? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query change_batch {
      sort = {change_batch.submitted_at: "desc"}
      return = {type: "list"}
      output = ["id", "teaminfo_id", "acted_by_users_id", "title", "status", "submitted_at", "withdrawn_at", "closed_at", "club_comment"]
    } as $batches
    db.query change_request {
      where = $db.change_request.batch_id != null
      return = {type: "list"}
      output = ["id", "batch_id", "entity", "action", "status"]
    } as $rows
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName"]
    } as $teams
    db.query Users {
      return = {type: "list"}
      output = ["id", "Name"]
    } as $users

    api.lambda {
      code = """
        const клуб = new Map(($var.teams || []).map((t) => [t.id, t.TeamName]));
        const людина = new Map(($var.users || []).map((u) => [u.id, u.Name]));
        const стан = String($input.state || 'open');
        const тип = String($input.entity || '');
        const клубId = Number($input.teaminfo_id) || null;
        return ($var.batches || []).map((b) => {
          const р = ($var.rows || []).filter((r) => r.batch_id === b.id);
          const за = (s) => р.filter((r) => r.status === s).length;
          const counts = { submitted: за('submitted'), approved: за('approved'), applied: за('applied'), rejected: за('rejected'), failed: за('failed') };
          const state = counts.submitted > 0 ? 'open' : р.length ? 'done' : 'withdrawn';
          return {
            id: b.id, teaminfo_id: b.teaminfo_id, club_name: клуб.get(b.teaminfo_id) || null,
            acted_by_name: b.acted_by_users_id ? людина.get(b.acted_by_users_id) || 'Адмін' : null,
            title: b.title || null, club_comment: b.club_comment || null, status: b.status, state,
            submitted_at: b.submitted_at, closed_at: b.closed_at || null, withdrawn_at: b.withdrawn_at || null,
            rows: р.length, counts, entities: [...new Set(р.map((r) => r.entity))],
          };
        }).filter((b) => (стан === 'all' || b.state === стан) && (!клубId || b.teaminfo_id === клубId) && (!тип || b.entities.includes(тип)))
          // що чекає довше — вище
          .sort((a, b) => (a.state === 'open' && b.state === 'open' ? Number(a.submitted_at) - Number(b.submitted_at) : Number(b.submitted_at) - Number(a.submitted_at)));
      """
      timeout = 20
    } as $result
  }

  response = $result
}
