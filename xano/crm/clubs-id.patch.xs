query "clubs/{teaminfo_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int teaminfo_id filters=min:1
    text TeamName? filters=trim
    text TeamInfo? filters=trim
    bool Relevance?
    int leagues_id?
    int parent_teaminfo_id?
    int founded_year?
    int home_venues_id?
    text website? filters=trim
    text instagram? filters=trim
    text facebook? filters=trim
    text youtube? filters=trim
    text colors? filters=trim
    text contact_name? filters=trim
    text contact_phone? filters=trim
    text contact_email? filters=trim
    text team_kind? filters=trim
    text country? filters=trim
    text kit_color_primary? filters=trim
    text kit_color_secondary? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 5, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.parent_teaminfo_id != $input.teaminfo_id) {
      error_type = "badrequest"
      error = "Клуб не може бути материнським для самого себе"
    }

    db.get TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Клуб не знайдено"
    }

    precondition ($input.team_kind == null || $input.team_kind == "" || $input.team_kind == "збірна" || $input.team_kind == "іноземний клуб") {
      error_type = "badrequest"
      error = "Вид команди має бути порожнім (клуб АФУ), «збірна» або «іноземний клуб»"
    }

    // Кольори форми (R43): порожньо або #RRGGBB. Перевірка в JS — regex_matches
    // у XanoScript ненадійний (новини, 26.09)
    api.lambda {
      code = """
        const ok = (v) => v == null || v === '' || /^#[0-9A-Fa-f]{6}$/.test(v);
        return ok($input.kit_color_primary) && ok($input.kit_color_secondary);
      """
      timeout = 10
    } as $colors_ok
    precondition ($colors_ok == true) {
      error_type = "badrequest"
      error = "Колір форми має бути у форматі #RRGGBB, наприклад #1E4FA0"
    }

    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    db.patch TeamInfo {
      field_name = "id"
      field_value = $input.teaminfo_id
      data = `$input|pick:($raw|keys)|unset:"teaminfo_id"`
    } as $club

    // Суперник лишається поза списками й пікерами ADMIN, що б не прийшло в
    // Relevance чи leagues_id (R20)
    conditional {
      if ($club.team_kind != null && $club.team_kind != "") {
        db.edit TeamInfo {
          field_name = "id"
          field_value = $input.teaminfo_id
          data = {Relevance: false, leagues_id: null, parent_teaminfo_id: null}
        } as $club
      }
    }
  }

  response = $club
}
