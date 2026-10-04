query "me/topics" verb=GET {
  api_group = "app"
  auth = "Users fans"

  // R55. Теми сповіщень поточного вболівальника. Завжди масив: якщо тем ще не
  // задано (null або []), віддаємо всі п'ять — так і працює розсилка.
  input {
  }

  stack {
    db.get "Users fans" {
      field_name = "id"
      field_value = $auth.id
      output = ["notification_topics", "platform", "send_notifications"]
    } as $me

    api.lambda {
      code = """
        const ALL = ['favorites', 'live', 'top', 'news', 'updates'];
        const t = $var.me && $var.me.notification_topics;
        return Array.isArray(t) && t.length ? ALL.filter((x) => t.includes(x)) : ALL;
      """
      timeout = 10
    } as $topics
  }

  response = $topics
}
