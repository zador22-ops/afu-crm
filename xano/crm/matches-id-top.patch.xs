query "matches/{match_id}/top" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // R3 «Топ-матч». Окремий ендпоінт, а не поле в PATCH /matches/{id}: у того
  // своя логіка статусів і турнірної таблиці, а тут лише одна галочка.
  //
  // Правила (бриф PM 1, 24.09):
  // - поставити можна лише майбутньому матчу: статус «Запланований» (1) або
  //   «Перенесений» (2) і TimeOfMatch пізніше за зараз;
  // - зняти можна завжди, щоб прибрати застарілу позначку;
  // - топ-матч один на КИЇВСЬКИЙ день. Другий на той самий день — відмова з
  //   назвою першого. Чужі рядки не змінюємо мовчки: оператор знімає сам.
  input {
    int match_id filters=min:1
    bool is_top
  }

  stack {
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
    } as $match
    precondition ($match != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }

    db.query Match {
      where = $db.Match.is_top == true && $db.Match.id != $input.match_id
      return = {type: "list"}
      output = ["id", "TimeOfMatch", "team1_id", "team2_id"]
      addon = [
        {
          name  : "TeamInfo"
          output: ["TeamName"]
          input : {Teams_id: $output.team1_id}
          as    : "_team1"
        }
        {
          name  : "TeamInfo"
          output: ["TeamName"]
          input : {Teams_id: $output.team2_id}
          as    : "_team2"
        }
      ]
    } as $others

    // Перевірки й повідомлення — у JS: день за Києвом і склеювання рядка з
    // числами XanoScript-ом не зробити надійно (див. zones, 19.09).
    api.lambda {
      code = """
        if (!$input.is_top) return { ok: true, message: '' };
        const m = $var.match;
        if (m.match_status_id !== 1 && m.match_status_id !== 2) {
          return { ok: false, message: 'Топ-матчем можна зробити лише запланований або перенесений матч' };
        }
        const t = Number(m.TimeOfMatch);
        if (!t || t <= Date.now()) {
          return { ok: false, message: 'Топ-матчем можна зробити лише матч у майбутньому' };
        }
        const kyivDay = (ms) => new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Number(ms)));
        const kyivTime = (ms) => new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' }).format(new Date(Number(ms)));
        const day = kyivDay(t);
        const same = ($var.others || []).find(o => o.TimeOfMatch && kyivDay(o.TimeOfMatch) === day);
        if (same) {
          const a = (same._team1 && same._team1.TeamName) || ('#' + same.team1_id);
          const b = (same._team2 && same._team2.TeamName) || ('#' + same.team2_id);
          return { ok: false, message: `Топ-матч ${day} уже є: ${a} — ${b}, ${kyivTime(same.TimeOfMatch)}. Спершу зніміть позначку з нього` };
        }
        return { ok: true, message: '' };
      """
      timeout = 10
    } as $check

    precondition ($check.ok == true) {
      error_type = "badrequest"
      error = $check.message
    }

    db.patch Match {
      field_name = "id"
      field_value = $input.match_id
      data = {is_top: $input.is_top}
    } as $saved
  }

  response = $saved
}
