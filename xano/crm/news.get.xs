query news verb=GET {
  api_group = "crm"
  auth = "Users"

  // Список новин для CRM. Фільтри, пошук і сторінки — у JS: новин поки сотні,
  // а одна вибірка без тексту новини (body_html) дешевша за складний where.
  input {
    text q? filters=trim
    int category_id?=0
    text status? filters=trim
    int page?=1
    int per_page?=50
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 13, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query news {
      return = {type: "list"}
      output = ["id", "created_at", "title", "slug", "category_id", "lead", "cover", "cover_alt", "is_featured", "status", "published_at", "updated_at", "tournament_ids", "club_ids", "match_id"]
      addon = [
        {
          name  : "news_category"
          output: ["id", "name", "slug"]
          input : {news_category_id: $output.category_id}
          as    : "_category"
        }
      ]
    } as $all

    api.lambda {
      code = """
        const q = ($input.q || '').toLowerCase();
        const cat = Number($input.category_id) || 0;
        const st = $input.status || '';
        const per = Math.min(Math.max(Number($input.per_page) || 50, 1), 200);
        const page = Math.max(Number($input.page) || 1, 1);
        const key = (n) => Number(n.published_at || n.updated_at || n.created_at || 0);
        const rows = ($var.all || [])
          .filter((n) => !cat || n.category_id === cat)
          .filter((n) => !st || n.status === st)
          .filter((n) => !q || (n.title || '').toLowerCase().includes(q) || (n.lead || '').toLowerCase().includes(q) || (n.slug || '').includes(q))
          .sort((a, b) => key(b) - key(a));
        return { items: rows.slice((page - 1) * per, page * per), total: rows.length, page, per_page: per };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
