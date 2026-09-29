query "governing-bodies" verb=GET {
  api_group = "site"

  // Активні органи з активним складом за sort_order. Члени — лише ім'я,
  // прізвище, посада, фото; контакт — лише службова пошта органу
  input {
  }

  stack {
    db.query governing_body {
      where = $db.governing_body.is_active == true
      return = {type: "list"}
      output = ["id", "name", "slug", "kind", "description", "contact_email", "sort_order"]
    } as $bodies
    db.query governing_member {
      where = $db.governing_member.is_active == true
      return = {type: "list"}
      output = ["id", "body_id", "first_name", "last_name", "position", "photo", "sort_order"]
    } as $members
    api.lambda {
      code = """
        const img = (i) => (i && i.url ? { url: i.url, width: (i.meta && i.meta.width) || null, height: (i.meta && i.meta.height) || null } : null);
        const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
        return ($var.bodies || []).sort(bySort).map((b) => ({
          id: b.id, name: b.name, slug: b.slug, kind: b.kind, description: b.description || null, contact_email: b.contact_email || null,
          members: ($var.members || []).filter((m) => m.body_id === b.id).sort(bySort).map((m) => ({ id: m.id, first_name: m.first_name, last_name: m.last_name, position: m.position || null, photo: img(m.photo) })),
        }));
      """
      timeout = 10
    } as $out
  }

  response = $out
}
