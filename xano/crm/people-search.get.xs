query "people/search" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    text q? filters=trim
    int limit?=50
  }

  stack {
    // Пошук за початком прізвища без урахування регістру, як у Get-peopleBySearchPhrase.
    // x1_6 — таблиця People (id 6) у воркспейсі 1.
    //
    // ФОТО ВІДДАЄМО ШЛЯХОМ, А НЕ АДРЕСОЮ. У самій колонці лежить лише `path`;
    // готовий `url` Xano добудовує на льоту, коли рядок читається через
    // db.query або аддон, — а прямий SQL віддає те, що в базі. Тому спершу
    // тут стояло `Photo->>'url'`, і воно мовчки повертало null: такого ключа
    // просто немає. Адреса збирається нижче, як це робить ADMIN
    // (global-functions/MakeURL_from_path.js): база інстансу + path.
    db.direct_query {
      sql = """
        SELECT x1_6.id, x1_6.prizvushche, x1_6."Name", x1_6.po_batkovi, x1_6."City",
               x1_6."Date_of_birth", x1_6."Photo"->>'path' AS photo_path, x1_6."Growth", x1_6."Weight"
        FROM x1_6
        WHERE LOWER(x1_6.prizvushche) ILIKE LOWER(?) || '%'
        ORDER BY x1_6.prizvushche ASC, x1_6."Name" ASC
        LIMIT ?;
        """
      response_type = "list"
      arg = $input.q
      arg = $input.limit
    } as $people

    api.lambda {
      code = """
        const база = 'https://xdeg-kg7i-jjtu.f2.xano.io';
        return ($var.people || []).map((p) => ({
          ...p,
          photo_url: p.photo_path ? база + p.photo_path : null,
        }));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
