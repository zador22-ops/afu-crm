query "game-admin/sessions/rejected" verb=GET {
  api_group = "crm"
  auth = "Users"

  // Партії, відхилені захистом сервера (game_session.status = rejected), з
  // причиною й надісланим списком ударів. Живуть 7 днів (прибирає «Game close months»).
  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.direct_query {
      sql = """
        SELECT s.id, s.fans_id, f.game_nick AS nick, s.started_at, s.finished_at, s.reject_reason, s.shots_list
          FROM x1_83 s
          LEFT JOIN x1_30 f ON f.id = s.fans_id
         WHERE s.status = 'rejected'
         ORDER BY s.started_at DESC
         LIMIT 200
        """
      response_type = "list"
    } as $rows

    api.lambda {
      code = """
        return ($var.rows || []).map((r) => {
          let shots = r.shots_list;
          if (typeof shots === 'string') { try { shots = JSON.parse(shots); } catch (e) { shots = null; } }
          return {
            id: Number(r.id), fans_id: r.fans_id == null ? null : Number(r.fans_id), nick: r.nick ?? null,
            started_at: r.started_at == null ? null : Number(r.started_at), finished_at: r.finished_at == null ? null : Number(r.finished_at),
            reject_reason: r.reject_reason ?? null, shots_list: shots, shots_count: Array.isArray(shots) ? shots.length : 0,
          };
        });
      """
      timeout = 10
    } as $out
  }

  response = $out
}
