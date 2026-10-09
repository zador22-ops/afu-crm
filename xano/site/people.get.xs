query people verb=GET {
  api_group = "site"

  // afu-crm#10 п.8. Список осіб для sitemap: лише ті, хто є на сайті — у заявці
  // клубу (Team) або в штабі (Administration of teams). Лише id, ім'я, прізвище:
  // без дат народження й по батькові. updated_at — дата створення запису (окремої
  // дати зміни в таблиці People немає).
  input {
  }

  stack {
    db.direct_query {
      sql = """
        SELECT p.id, p."Name" AS first_name, p.prizvushche AS last_name, p.created_at AS updated_at
          FROM x1_6 p
         WHERE EXISTS (SELECT 1 FROM x1_7 t WHERE t.player_id = p.id)
            OR EXISTS (SELECT 1 FROM x1_19 a WHERE a.people_id = p.id)
         ORDER BY p.id
        """
      response_type = "list"
    } as $rows

    api.lambda {
      code = """
        return ($var.rows || []).map((r) => ({ id: Number(r.id), first_name: r.first_name || null, last_name: r.last_name || null, updated_at: r.updated_at == null ? null : Number(r.updated_at) }));
      """
      timeout = 10
    } as $out
  }

  response = $out
}
