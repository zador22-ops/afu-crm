query version verb=GET {
  api_group = "app"

  // R57. Яка версія застосунку актуальна й нижче якої не пускати. Без
  // авторизації: перевірка йде до входу. Актуальну вносить продакт у CRM після
  // релізу (app_release), мінімальна й «примусово» — Variables 3/5/6/7.
  // update_available — є новіша за current (м'який банер); update_required —
  // примус увімкнено і current нижча за мінімальну (глухий екран).
  input {
    // fan — «Футзал АФУ», admin — ADMIN АФУ
    text app filters=trim
    text platform filters=trim
    // встановлена версія, «1.55.0» або «v.1.55.0»; без неї прапорці false
    text current? filters=trim
  }

  stack {
    precondition (($input.app == "fan" || $input.app == "admin") && ($input.platform == "ios" || $input.platform == "android")) {
      error_type = "badrequest"
      error = "app — fan або admin, platform — ios або android"
    }

    db.query Variables {
      where = $db.Variables.id == 3 || $db.Variables.id == 5 || $db.Variables.id == 6 || $db.Variables.id == 7
      return = {type: "list"}
      output = ["id", "bool", "text", "explanatio"]
    } as $vars

    db.query app_release {
      where = $db.app_release.app == $input.app && $db.app_release.platform == $input.platform
      sort = {app_release.released_at: "desc"}
      return = {type: "list"}
      output = ["version", "note", "store_url", "released_at"]
    } as $rel

    api.lambda {
      code = """
        const ID = { 'fan:android': 6, 'fan:ios': 7, 'admin:android': 3, 'admin:ios': 5 };
        const v = ($var.vars || []).find((r) => r.id === ID[$input.app + ':' + $input.platform]) || {};
        const parse = (s) => {
          if (s == null) return null;
          const n = String(s).trim().replace(/^[vV]\.?\s*/, '').split('.').filter((x) => /^\d+$/.test(x)).map(Number);
          return n.length ? n : null;
        };
        const cmp = (a, b) => {
          const x = parse(a), y = parse(b);
          if (!x || !y) return null;
          for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = x[i] || 0, q = y[i] || 0; if (p !== q) return p < q ? -1 : 1; }
          return 0;
        };
        const clean = (s) => (s ? String(s).trim().replace(/^[vV]\.?\s*/, '') : null);
        const r = ($var.rel || [])[0] || null;
        const latest = r ? { version: clean(r.version), note: r.note || null, store_url: r.store_url || v.explanatio || null, released_at: r.released_at || null } : null;
        const min = clean(v.text);
        const cur = $input.current || null;
        return {
          app: $input.app,
          platform: $input.platform,
          latest,
          min_version: min,
          force: v.bool === true,
          store_url: (latest && latest.store_url) || v.explanatio || null,
          update_available: !!(cur && latest && cmp(cur, latest.version) === -1),
          update_required: !!(cur && v.bool === true && min && cmp(cur, min) === -1),
        };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
