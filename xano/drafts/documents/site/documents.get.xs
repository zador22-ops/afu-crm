query documents verb=GET {
  api_group = "site"

  // Лише опубліковані документи з файлом в активних рубриках. Файл — {url, size, mime, name}.
  // category — slug рубрики, необов'язковий
  input {
    text category? filters=trim
  }

  stack {
    db.query document {
      where = $db.document.is_published == true
      return = {type: "list"}
      output = ["id", "title", "category_id", "file", "description", "document_date", "season_id", "sort_order", "updated_at"]
    } as $rows
    db.query document_category {
      where = $db.document_category.is_active == true
      return = {type: "list"}
      output = ["id", "name", "slug"]
    } as $cats
    db.query Season {
      return = {type: "list"}
      output = ["id", "name"]
    } as $seasons
    api.lambda {
      code = """
        const C = Object.fromEntries(($var.cats || []).map((c) => [c.id, c]));
        const S = Object.fromEntries(($var.seasons || []).map((s) => [s.id, s]));
        const base = 'https://xdeg-kg7i-jjtu.f2.xano.io';
        const file = (f) => (f && (f.url || f.path) ? { url: f.url || base + f.path, size: f.size || null, mime: f.mime || null, name: f.name || null } : null);
        const cat = $input.category || '';
        return ($var.rows || [])
          .filter((d) => C[d.category_id] && d.file && (!cat || C[d.category_id].slug === cat))
          .map((d) => ({ id: d.id, title: d.title, category: { id: C[d.category_id].id, name: C[d.category_id].name, slug: C[d.category_id].slug }, file: file(d.file), description: d.description || null, document_date: d.document_date || null, season: S[d.season_id] ? { id: d.season_id, name: S[d.season_id].name } : null, sort_order: d.sort_order ?? 0, updated_at: d.updated_at || null }))
          .sort((a, b) => a.sort_order - b.sort_order || String(b.document_date || '').localeCompare(String(a.document_date || '')) || b.id - a.id);
      """
      timeout = 10
    } as $out
  }

  response = $out
}
