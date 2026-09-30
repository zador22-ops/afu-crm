query partners verb=GET {
  api_group = "site"

  // Партнери для футера сайту: лише активні, за sort_order (afu-crm#5)
  input {
  }

  stack {
    db.query partner {
      where = $db.partner.is_active == true
      sort = {partner.sort_order: "asc", partner.id: "asc"}
      return = {type: "list"}
      output = ["id", "name", "logo", "url", "category"]
    } as $rows
    api.lambda {
      code = """
        const img = (i) => (i && i.url ? { url: i.url, width: (i.meta && i.meta.width) || null, height: (i.meta && i.meta.height) || null } : null);
        return ($var.rows || []).map((p) => ({ id: p.id, name: p.name, logo: img(p.logo), url: p.url || null, category: p.category || null }));
      """
      timeout = 10
    } as $out
  }

  response = $out
}
