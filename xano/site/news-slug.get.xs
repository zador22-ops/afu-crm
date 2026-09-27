query "news/{slug}" verb=GET {
  api_group = "site"

  // Одна новина за адресою. Неопублікована, відкладена чи в неактивній
  // рубриці — 404, щоб чернетки не можна було прочитати, вгадавши slug.
  input {
    text slug filters=trim|lower
  }

  stack {
    db.query news {
      where = $db.news.slug == $input.slug && $db.news.status == "published"
      return = {type: "list"}
      output = ["id", "title", "slug", "category_id", "lead", "body_html", "cover", "cover_alt", "gallery", "video_url", "tournament_ids", "club_ids", "match_id", "is_featured", "status", "published_at", "updated_at"]
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
        const n = ($var.rows || []).find(live);
        if (!n) return null;
        const gallery = Array.isArray(n.gallery) ? n.gallery.map((g) => ({ image: img(g && g.image), alt: (g && g.alt) || '', caption: (g && g.caption) || '' })).filter((g) => g.image) : [];
        return { ...card(n), body_html: n.body_html || '', gallery };
      """
      timeout = 10
    } as $item

    precondition ($item != null) {
      error_type = "notfound"
      error = "Новину не знайдено"
    }
  }

  response = $item
}
