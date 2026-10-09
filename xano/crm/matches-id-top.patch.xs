query "matches/{match_id}/top" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  // R3 «Топ-матч». Окремий ендпоінт, а не поле в PATCH /matches/{id}: у того
  // своя логіка статусів і турнірної таблиці, а тут лише одна галочка.
  //
  // Правила (R60а, Андрій 09.10: топ-матч — реклама матчу, їх може бути кілька):
  // - поставити можна матчу, чий КИЇВСЬКИЙ день — сьогодні або пізніше, будь-якого
  //   статусу (сьогоднішній зіграний лишається на Головній до кінця дня);
  // - кількість не обмежена: правило «один на день» (R3, 24.09) знято;
  // - зняти можна завжди. Минулі позначки самі не знімаються — matches/top/list
  //   просто їх не віддає.
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

    // Перевірки й повідомлення — у JS: день за Києвом і склеювання рядка з
    // числами XanoScript-ом не зробити надійно (див. zones, 19.09).
    api.lambda {
      code = """
        if (!$input.is_top) return { ok: true, message: '' };
        const t = Number($var.match.TimeOfMatch);
        const kyivDay = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Number(ms)));
        if (!t || kyivDay(t) < kyivDay(Date.now())) {
          return { ok: false, message: 'Топ-матчем можна зробити лише сьогоднішній або майбутній матч' };
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
