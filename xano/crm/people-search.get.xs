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
    db.direct_query {
      sql = """
        SELECT x1_6.id, x1_6.prizvushche, x1_6."Name", x1_6.po_batkovi, x1_6."City",
               x1_6."Date_of_birth", x1_6."Photo"->>'url' AS photo_url, x1_6."Growth", x1_6."Weight"
        FROM x1_6
        WHERE LOWER(x1_6.prizvushche) ILIKE LOWER(?) || '%'
        ORDER BY x1_6.prizvushche ASC, x1_6."Name" ASC
        LIMIT ?;
        """
      response_type = "list"
      arg = $input.q
      arg = $input.limit
    } as $people
  }

  response = $people
}
