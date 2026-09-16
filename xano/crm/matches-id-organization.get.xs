query "matches/{match_id}/organization" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
  }

  stack {
    // Шаблон чекліста делегата живе одним рядком у Variables (id 2), пункти
    // розділені символом ₴. Так його читає й ADMIN — формат не чіпаємо.
    db.get Variables {
      field_name = "id"
      field_value = 2
      output = ["id", "text"]
    } as $template

    db.query "Organization Match" {
      where = $db.Organization_Match.match_id == $input.match_id
      sort = {Organization_Match.id: "asc"}
      return = {type: "list"}
      addon = [
        {
          name  : "Organization_Match_Photos_by_match_id_list"
          output: ["id", "photo"]
          input : {organization_match_id: $output.id}
          as    : "_photos"
        }
      ]
    } as $items
  }

  response = {template: $template.text, items: $items}
}
