// R55. Єдина точка відправки пушів нового формату в Expo і журнал push_log.
// Запобіжник push_config (рядок 1): live = false — повідомлення йдуть лише на
// test_tokens, по одному на кожен варіант тексту й картинки; dry_run — нікуди.
// once = true — не слати вдруге той самий kind+ref (у тому ж режимі або live).
function "Push v2 deliver" {
  input {
    text kind filters=trim
    text ref? filters=trim
    // [{to: [токени], title, body, data, image}] — групи отримувачів з однаковим текстом
    json messages?
    bool dry_run?=false
    bool once?=false
    // silent — лише зафіксувати в журналі, нічого не надсилати (перша версія, старі новини)
    bool silent?=false
  }

  stack {
    db.get push_config {
      field_name = "id"
      field_value = 1
    } as $cfg

    db.query push_log {
      where = $db.push_log.kind == $input.kind && $db.push_log.ref == $input.ref
      return = {type: "list"}
      output = ["mode"]
    } as $was

    api.lambda {
      code = """
        const cfg = $var.cfg || {};
        const mode = $input.silent ? 'silent' : $input.dry_run ? 'dry' : cfg.live === true ? 'live' : 'test';
        const was = ($var.was || []).map((r) => r.mode);
        if ($input.once && was.some((m) => m === mode || m === 'live' || m === 'silent')) {
          return { skip: true, mode, recipients: 0, would_reach: 0, expo: [], title: '', body: '', sample: [] };
        }
        const groups = (Array.isArray($input.messages) ? $input.messages : []).filter((g) => g && g.title);
        const msg = (to, g) => {
          const m = { to, title: g.title, body: g.body || '', sound: 'default', data: g.data || {} };
          if (g.image) m.richContent = { image: g.image };
          return m;
        };
        const expo = [];
        let recipients = 0;
        if (mode === 'live') {
          for (const g of groups) {
            const to = [...new Set((g.to || []).filter(Boolean))];
            recipients += to.length;
            for (let i = 0; i < to.length; i += 99) expo.push(msg(to.slice(i, i + 99), g));
          }
        } else if (mode === 'test') {
          const test = (Array.isArray(cfg.test_tokens) ? cfg.test_tokens : []).filter(Boolean);
          const seen = new Set();
          for (const g of groups) {
            const key = g.title + '|' + g.body + '|' + (g.image || '');
            if (seen.has(key)) continue;
            seen.add(key);
            if (test.length) expo.push(msg(test.slice(0, 99), g));
          }
          recipients = expo.length ? test.length : 0;
        }
        const first = groups[0] || {};
        return {
          skip: false,
          mode,
          recipients,
          would_reach: groups.reduce((n, g) => n + new Set((g.to || []).filter(Boolean)).size, 0),
          expo,
          title: first.title || '',
          body: first.body || '',
          sample: groups.slice(0, 3).map((g) => ({ title: g.title, body: g.body, data: g.data, image: g.image || null, to_count: (g.to || []).length })),
        };
      """
      timeout = 10
    } as $plan

    conditional {
      if ($plan.skip == false) {
        foreach ($plan.expo) {
          each as $m {
            api.request {
              url = "https://exp.host/--/api/v2/push/send"
              method = "POST"
              params = $m
            } as $sent
          }
        }

        db.add push_log {
          data = {
            created_at: "now"
            kind      : $input.kind
            ref       : $input.ref
            sent_at   : "now"
            recipients: $plan.recipients
            mode      : $plan.mode
            title     : $plan.title
            body      : $plan.body
          }
        } as $log
      }
    }
  }

  response = {skip: $plan.skip, mode: $plan.mode, recipients: $plan.recipients, would_reach: $plan.would_reach, sample: $plan.sample}
}
