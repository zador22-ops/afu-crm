query releases verb=POST {
  api_group = "crm"
  auth = "Users"

  // R57. Новий реліз: продакт вносить, коли версія справді в магазині. Від
  // нього залежить м'який банер «Є оновлення» і пуш про версію (лише fan,
  // лише major/minor). Версія для пари app+platform унікальна.
  input {
    text app filters=trim
    text platform filters=trim
    text version filters=trim
    text note? filters=trim
    text store_url? filters=trim
    timestamp released_at?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 12, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query app_release {
      where = $db.app_release.app == $input.app && $db.app_release.platform == $input.platform
      return = {type: "list"}
      output = ["version"]
    } as $have

    api.lambda {
      code = """
        if ($input.app !== 'fan' && $input.app !== 'admin') return { ok: false, message: 'app — fan або admin' };
        if ($input.platform !== 'ios' && $input.platform !== 'android') return { ok: false, message: 'platform — ios або android' };
        const v = String($input.version || '').trim().replace(/^[vV]\.?\s*/, '');
        if (!/^\d+\.\d+(\.\d+)?$/.test(v)) return { ok: false, message: 'Версія у форматі 1.56.0' };
        if (($var.have || []).some((r) => String(r.version).replace(/^[vV]\.?\s*/, '') === v)) return { ok: false, message: `Версію ${v} уже внесено` };
        const u = $input.store_url || '';
        if (u && !/^https:\/\//.test(u)) return { ok: false, message: 'Посилання має починатися з https://' };
        return { ok: true, message: '', version: v };
      """
      timeout = 10
    } as $v

    precondition ($v.ok == true) {
      error_type = "badrequest"
      error = $v.message
    }

    db.add app_release {
      data = {
        created_at : "now"
        app        : $input.app
        platform   : $input.platform
        version    : $v.version
        note       : $input.note
        store_url  : $input.store_url
        released_at: $input.released_at ?? now
        created_by : $auth.id
      }
    } as $row
  }

  response = $row
}
