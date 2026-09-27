query "news-categories" verb=GET {
  api_group = "site"

  // Активні рубрики для меню сайту, у заданому порядку
  input {
  }

  stack {
    db.query news_category {
      where = $db.news_category.is_active == true
      sort = {news_category.sort_order: "asc", news_category.name: "asc"}
      return = {type: "list"}
      output = ["id", "name", "slug", "competition_id", "sort_order"]
    } as $items
  }

  response = $items
}
