query "document-categories" verb=GET {
  api_group = "site"

  // Активні рубрики документів за sort_order (afu-crm#6)
  input {
  }

  stack {
    db.query document_category {
      where = $db.document_category.is_active == true
      sort = {document_category.sort_order: "asc", document_category.name: "asc"}
      return = {type: "list"}
      output = ["id", "name", "slug", "sort_order"]
    } as $items
  }

  response = $items
}
