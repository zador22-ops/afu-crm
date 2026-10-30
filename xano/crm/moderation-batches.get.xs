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

    // Самовиліковування (рецензія Backend 4.1, п. 1): два одночасні рішення в одному
    // пакеті можуть обидва не побачити одне одного — тут доводимо до кінця тим самим
    // правилом: нова особа, чиї рядки остаточні й жоден не застосовано, — rejected /
    // failed (CAS v2: замок cr:<id>:<rev> + запис у транзакції; зайнято — пропускаємо);
    // пакет без рядків submitted / approved — closed (пакет закривають лише рішення,
    // доля batch:<id>:fate уже decided — замок не потрібен).
    db.query change_batch {
      where = $db.change_batch.status == "submitted"
      return = {type: "list"}
      output = ["id"]
    } as $open_batches
    db.query change_request {
      where = $db.change_request.batch_id != null
      return = {type: "list"}
      output = ["id", "batch_id", "entity", "action", "status", "depends_on_id", "rev"]
    } as $heal_rows
    api.lambda {
      code = """
        // Наслідки рішення для пакета — передбачення ДО транзакції, щоб замки були відомі наперед
        // (два одночасні рішення в одному пакеті, які цього не бачать, долагоджує GET moderation/batches):
        // нова особа, чиї рядки всі остаточні й жоден не застосовано, — rejected / failed;
        // пакет без рядків submitted / approved — closed.
        const ОСТАТОЧНІ = ['applied', 'rejected', 'failed'];
        const наслідки = (рядки, зміниВхід) => {
          const зміни = { ...зміниВхід };
          const стан = (r) => (r.id in зміни ? зміни[r.id] : r.status);
          const особи = [];
          for (const p of рядки.filter((r) => r.entity === 'person' && r.action === 'create' && стан(r) === 'submitted')) {
            const діти = рядки.filter((r) => r.depends_on_id === p.id);
            if (діти.length && діти.every((r) => ОСТАТОЧНІ.includes(стан(r))) && !діти.some((r) => стан(r) === 'applied')) {
              const s = діти.some((r) => стан(r) === 'failed') ? 'failed' : 'rejected';
              особи.push({ id: p.id, lock_rev: p.rev || 0, rev: (p.rev || 0) + 1, status: s });
              зміни[p.id] = s;
            }
          }
          return { persons: особи, close: рядки.length > 0 && !рядки.some((r) => ['submitted', 'approved'].includes(стан(r))) };
        };
        // Порядок замків: доля пакета, особа, далі cr: за зростанням id (однаковий у всіх — без взаємного очікування)
        const упорядкувати = (ключі) => [...ключі].sort((a, b) => (a.rank - b.rank) || ((a.request_id || 0) - (b.request_id || 0))).map(({ rank, ...k }) => k);
        const особи = [];
        const закрити = [];
        for (const b of $var.open_batches || []) {
          const р = ($var.heal_rows || []).filter((x) => x.batch_id === b.id);
          особи.push(...наслідки(р, {}).persons);
          // закриваємо за ФАКТИЧНИМ станом: особу, яку лагодимо зараз, пакет дочекається до наступного разу
          if (р.length && !р.some((x) => x.status === 'submitted' || x.status === 'approved')) закрити.push(b.id);
        }
        return { persons: особи.map((o) => ({ ...o, key: 'cr:' + o.id + ':' + o.lock_rev })), close: закрити };
      """
      timeout = 10
    } as $heal
    foreach ($heal.persons) {
      each as $hp {
        try_catch {
          try {
            // ТРАНЗАКЦІЯ ↓
            db.transaction {
              stack {
            // ТРАНЗАКЦІЯ ↑
                db.add change_lock {
                  data = {created_at: "now", key: $hp.key, op: "final", request_id: $hp.id, batch_id: null, users_id: $auth.id, club_account_id: null}
                } as $heal_lock
                db.edit change_request {
                  field_name = "id"
                  field_value = $hp.id
                  data = {status: $hp.status, updated_at: "now", decided_at: "now", decision_users_id: $auth.id, decision_comment: "Жоден рядок складу чи штабу не застосовано", open_key: null, rev: $hp.rev}
                } as $heal_person
            // ТРАНЗАКЦІЯ ↓
              }
            }
            // ТРАНЗАКЦІЯ ↑
          }
          catch {
          }
        }
      }
    }
    foreach ($heal.close) {
      each as $hb {
        db.edit change_batch {
          field_name = "id"
          field_value = $hb
          data = {status: "closed", closed_at: "now"}
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
