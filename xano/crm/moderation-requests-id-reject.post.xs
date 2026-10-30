query "moderation/requests/{request_id}/reject" verb=POST {
  api_group = "crm"
  auth = "Users"

  // «Повернути» заявку клубу (4.1; контракт 4.2 розділ 0, п. 4). Право 21.
  // Коментар обов'язковий. В основні таблиці нічого не пишеться. Перехід
  // статусу — CAS одним оператором через рядок пакета (has_decision), як і
  // «Погодити»: відкликання пакета й рішення серіалізуються на ньому.
  // Далі: нова особа (person.create), чиї рядки повернуто всі, — теж rejected
  // (рішенняОсоби); пакет без рядків submitted / approved — closed.
  input {
    int request_id filters=min:1
    text comment filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get change_request {
      field_name = "id"
      field_value = $input.request_id
      output = ["id", "batch_id", "entity", "action", "status", "depends_on_id"]
    } as $row
    api.lambda {
      code = """
        const r = $var.row;
        const к = String($input.comment || '').trim();
        return {
          found: !!r && r.batch_id != null,
          // person.create окремо не вирішується — лише через рядки складу / штабу
          decidable: !!r && !(r.entity === 'person' && r.action === 'create'),
          comment_ok: к.length >= 3 && к.length <= 1000,
        };
      """
      timeout = 5
    } as $check
    precondition ($check.found) {
      error_type = "notfound"
      error = "Заявку не знайдено"
    }
    precondition ($check.decidable) {
      error_type = "badrequest"
      error = "Нову особу окремо не повертають — поверніть її рядки складу чи штабу"
    }
    precondition ($check.comment_ok) {
      error_type = "badrequest"
      error = "Напишіть клубу, чому повертаєте (3–1000 знаків)"
    }

    // CAS: рядок пакета (has_decision = true) і сама заявка — одним оператором.
    // x1_92 — change_batch, x1_93 — change_request.
    db.direct_query {
      sql = """
        WITH b AS (
          UPDATE x1_92 SET has_decision = true
          WHERE id = ? AND status = 'submitted'
          RETURNING id
        )
        UPDATE x1_93 SET status = 'rejected'
        WHERE id = ? AND status = 'submitted' AND batch_id IN (SELECT id FROM b)
        RETURNING id;
        """
      response_type = "list"
      arg = $row.batch_id
      arg = $input.request_id
    } as $taken
    precondition (($taken|count) > 0) {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
    }
    // Рядок уже «наш» — решта полів звичайним записом, без статусу
    db.edit change_request {
      field_name = "id"
      field_value = $input.request_id
      data = {updated_at: "now", decided_at: "now", decision_users_id: $auth.id, decision_comment: $input.comment, open_key: null}
    } as $decided

    // Нова особа: повернуто всі рядки, що на неї посилаються, — повернути й її
    conditional {
      if ($row.depends_on_id != null) {
        db.direct_query {
          sql = """
            UPDATE x1_93 p SET status = 'rejected'
            WHERE p.id = ? AND p.status = 'submitted'
              AND NOT EXISTS (SELECT 1 FROM x1_93 r WHERE r.depends_on_id = p.id AND r.status <> 'rejected')
            RETURNING id;
            """
          response_type = "list"
          arg = $row.depends_on_id
        } as $person_rejected
        conditional {
          if (($person_rejected|count) > 0) {
            db.edit change_request {
              field_name = "id"
              field_value = $row.depends_on_id
              data = {updated_at: "now", decided_at: "now", decision_users_id: $auth.id, decision_comment: "Усі рядки складу й штабу повернуто", open_key: null}
            } as $person_decided
          }
        }
      }
    }

    // Пакет закривається за рядками: не лишилось submitted / approved
    db.direct_query {
      sql = """
        UPDATE x1_92 SET status = 'closed'
        WHERE id = ? AND status = 'submitted'
          AND NOT EXISTS (SELECT 1 FROM x1_93 r WHERE r.batch_id = x1_92.id AND r.status IN ('submitted', 'approved'))
        RETURNING id;
        """
      response_type = "list"
      arg = $row.batch_id
    } as $closed
    conditional {
      if (($closed|count) > 0) {
        db.edit change_batch {
          field_name = "id"
          field_value = $row.batch_id
          data = {closed_at: "now"}
        } as $batch_closed
      }
    }
  }

  response = {request_id: $input.request_id, status: "rejected", batch_closed: ($closed|count) > 0}
}
