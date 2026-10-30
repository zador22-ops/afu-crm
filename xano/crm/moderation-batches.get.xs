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

    // Самовиліковування (рецензія Backend 4.1, п. 1): два одночасні рішення в
    // одному пакеті можуть обидва не закрити його — закриваємо тут тим самим
    // правилом (рядки є, і жоден не submitted / approved)
    db.direct_query {
      sql = """
        UPDATE x1_92 SET status = 'closed'
        WHERE status = 'submitted'
          AND EXISTS (SELECT 1 FROM x1_93 r WHERE r.batch_id = x1_92.id)
          AND NOT EXISTS (SELECT 1 FROM x1_93 r WHERE r.batch_id = x1_92.id AND r.status IN ('submitted', 'approved'))
        RETURNING id;
        """
      response_type = "list"
    } as $healed
    foreach ($healed) {
      each as $h {
        db.edit change_batch {
          field_name = "id"
          field_value = $h.id
          data = {closed_at: "now"}
        } as $healed_batch
      }
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
