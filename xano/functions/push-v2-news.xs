// R55. Пуш про новину: усім, у кого ввімкнена тема news. Один раз на новину.
// Кличе задача push_versions_news для опублікованих новин, дата яких настала.
function "Push v2 news" {
  input {
    int news_id
    bool dry_run?=false
    bool silent?=false
  }

  stack {
    db.get news {
      field_name = "id"
      field_value = $input.news_id
      output = ["id", "title", "lead", "cover", "status", "published_at"]
    } as $n

    function.run "Push v2 audience" {
      input = {kind: "news"}
    } as $aud

    api.lambda {
      code = """
        const n = $var.n || {};
        const url = (i) => (i && i.url ? i.url : i && i.path ? 'https://xdeg-kg7i-jjtu.f2.xano.io' + i.path : null);
        const lead = (n.lead || '').trim();
        const body = '📰 Новина АФУ' + (lead ? ' · ' + (lead.length > 140 ? lead.slice(0, 139) + '…' : lead) : '');
        return [{ to: ($var.aud || []).map((a) => a.token), title: n.title || 'Новина АФУ', body, data: { news_id: n.id }, image: url(n.cover) }];
      """
      timeout = 10
    } as $messages

    function.run "Push v2 deliver" {
      input = {kind: "news", ref: $input.news_id|to_text, messages: $messages, dry_run: $input.dry_run, once: true, silent: $input.silent}
    } as $sent
  }

  response = $sent
}
