query news verb=GET {
  api_group = "site"

  // Публічна стрічка новин для сайту. Лише status = published і
  // published_at <= зараз (майбутня дата = відкладена публікація), лише
  // активні рубрики. Поля — явним переліком: хто створив чи редагував, сюди
  // не потрапляє ніколи. Без авторизації, нічого не пише.
  input {
    int page?=1
    int per_page?=20
    text category? filters=trim
    int tournament_id?=0
    int club_id?=0
    int match_id?=0
    bool featured?=false
  }

  stack {
    db.query news {
      where = $db.news.status == "published"
      return = {type: "list"}
      output = ["id", "title", "slug", "category_id", "lead", "cover", "cover_alt", "video_url", "tournament_ids", "club_ids", "match_id", "is_featured", "status", "published_at", "updated_at"]
    } as $rows
    db.query news_category {
      where = $db.news_category.is_active == true
      return = {type: "list"}
    } as $cats

    api.lambda {
      code = """
        const img = (i) => (i && i.url ? { url: i.url, width: (i.meta && i.meta.width) || null, height: (i.meta && i.meta.height) || null } : null);
        const cats = {};
        for (const c of ($var.cats || [])) cats[c.id] = { id: c.id, name: c.name, slug: c.slug, competition_id: c.competition_id || null };
        const now = Date.now();
        const live = (n) => n.status === 'published' && n.published_at && Number(n.published_at) <= now && (!n.category_id || cats[n.category_id]);
        const card = (n) => ({
          id: n.id, title: n.title, slug: n.slug, lead: n.lead,
          cover: img(n.cover), cover_alt: n.cover_alt || '',
          category: cats[n.category_id] || null,
          is_featured: Boolean(n.is_featured), video_url: n.video_url || null,
          tournament_ids: n.tournament_ids || [], club_ids: n.club_ids || [], match_id: n.match_id || null,
          published_at: n.published_at, updated_at: n.updated_at,
        });
        const per = Math.min(Math.max(Number($input.per_page) || 20, 1), 50);
        const page = Math.max(Number($input.page) || 1, 1);
        const cat = $input.category || '';
        const t = Number($input.tournament_id) || 0, c = Number($input.club_id) || 0, m = Number($input.match_id) || 0;
        const rows = ($var.rows || [])
          .filter(live)
          .filter((n) => !cat || (cats[n.category_id] && cats[n.category_id].slug === cat))
          .filter((n) => !t || (n.tournament_ids || []).includes(t))
          .filter((n) => !c || (n.club_ids || []).includes(c))
          .filter((n) => !m || n.match_id === m)
          .filter((n) => !$input.featured || n.is_featured)
          .sort((a, b) => Number(b.published_at) - Number(a.published_at));
        return { items: rows.slice((page - 1) * per, page * per).map(card), total: rows.length, page, per_page: per };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
