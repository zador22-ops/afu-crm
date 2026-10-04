// R55. Кожні 15 хв: нові версії застосунку в магазинах і новини, дата яких настала.
// Версії: iOS — публічний lookup Apple (id 6751099723), Android — Variables 6
// (поки так; Play Developer API — пізніше). Пуш лише на major/minor і лише
// токенам своєї платформи. Версія, що вже в магазині на першому запуску,
// фіксується в push_log без розсилки (mode silent) — так само всі новини, уже
// опубліковані на першому запуску. Новини старші за добу не шлються ніколи.
// Режим (тест чи справжні) визначає push_config через Push v2 deliver.
task push_versions_news {
  stack {
    api.request {
      url = "https://itunes.apple.com/lookup?id=6751099723&country=ua"
      method = "GET"
    } as $ios

    db.get Variables {
      field_name = "id"
      field_value = 6
      output = ["text"]
    } as $android

    db.query push_log {
      where = $db.push_log.kind == "update_ios" || $db.push_log.kind == "update_android" || $db.push_log.kind == "news"
      sort = {push_log.sent_at: "desc"}
      return = {type: "list"}
      output = ["kind", "ref", "mode", "sent_at"]
    } as $log

    db.query app_version_note {
      return = {type: "list"}
      output = ["platform", "version", "note"]
    } as $notes

    db.query news {
      where = $db.news.status == "published" && $db.news.published_at <= now
      return = {type: "list"}
      output = ["id", "published_at"]
    } as $published

    api.lambda {
      code = """
        const body = $var.ios && $var.ios.response && $var.ios.response.result;
        const parsed = typeof body === 'string' ? (() => { try { return JSON.parse(body); } catch (e) { return null; } })() : body;
        const iosV = parsed && parsed.results && parsed.results[0] && parsed.results[0].version || null;
        const andV = (($var.android && $var.android.text) || '').replace(/^v\\.?/i, '').trim() || null;
        const log = ($var.log || []).filter((r) => r.mode !== 'dry');
        const mm = (v) => { const [a, b] = String(v || '').split('.').map((x) => parseInt(x, 10) || 0); return a * 1000 + b; };
        const notes = $var.notes || [];
        const STORE = { ios: 'App Store', android: 'Google Play' };
        const versions = [];
        for (const [p, v] of [['ios', iosV], ['android', andV]]) {
          if (!v) continue;
          const kind = 'update_' + p;
          const last = log.find((r) => r.kind === kind);
          if (last && last.ref === v) continue;
          const silent = !last || mm(v) <= mm(last.ref);
          const n = notes.find((x) => x.platform === p && x.version === v);
          versions.push({
            platform: p, kind, version: v, silent,
            title: 'Вийшло оновлення',
            body: n && n.note ? `${n.note} Оновіть у ${STORE[p]}.` : `Нова версія «Футзал АФУ» ${v} уже в ${STORE[p]}. Оновіть, щоб нічого не пропустити.`,
          });
        }
        const seen = new Set(log.filter((r) => r.kind === 'news').map((r) => String(r.ref)));
        const first = !log.some((r) => r.kind === 'news');
        const day = Date.now() - 86400000;
        const news = ($var.published || [])
          .filter((n) => !seen.has(String(n.id)))
          .map((n) => ({ id: n.id, silent: first || Number(n.published_at) < day }));
        return { versions, news, ios: iosV, android: andV };
      """
      timeout = 20
    } as $plan

    foreach ($plan.versions) {
      each as $v {
        function.run "Push v2 audience" {
          input = {kind: "update", platform: $v.platform}
        } as $aud

        api.lambda {
          code = """
            const v = $var.v;
            return [{ to: ($var.aud || []).map((a) => a.token), title: v.title, body: v.body, data: { update: v.platform, version: v.version } }];
          """
          timeout = 10
        } as $messages

        function.run "Push v2 deliver" {
          input = {kind: $v.kind, ref: $v.version, messages: $messages, once: true, silent: $v.silent}
        } as $sent
      }
    }

    foreach ($plan.news) {
      each as $n {
        function.run "Push v2 news" {
          input = {news_id: $n.id, silent: $n.silent}
        } as $sent
      }
    }
  }

  schedule = [{starts_on: 2026-10-04 09:15:00+0000, freq: 900}]
}
