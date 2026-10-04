query "me/topics" verb=PATCH {
  api_group = "app"
  auth = "Users fans"

  // R55. Записати теми сповіщень: topics — масив із favorites, live, top, news,
  // updates (порядок неважливий, дублі й невідомі назви — 400). platform —
  // ios або android: потрібна для пуша про нову версію, бо Expo-токен
  // платформи не містить. Порожній масив = «усі ввімкнені» (вимкнути все —
  // головним перемикачем send_notifications). Відповідь — як у GET.
  input {
    json topics
    text platform? filters=trim
  }

  stack {
    api.lambda {
      code = """
        const ALL = ['favorites', 'live', 'top', 'news', 'updates'];
        const t = $input.topics;
        if (!Array.isArray(t)) return { ok: false, message: 'topics має бути масивом' };
        if (t.some((x) => !ALL.includes(x))) return { ok: false, message: 'Невідома тема. Можна: ' + ALL.join(', ') };
        if (new Set(t).size !== t.length) return { ok: false, message: 'Тема повторюється' };
        const p = $input.platform;
        if (p != null && p !== '' && p !== 'ios' && p !== 'android') return { ok: false, message: 'platform — ios або android' };
        return { ok: true, message: '', topics: ALL.filter((x) => t.includes(x)), platform: p || null };
      """
      timeout = 10
    } as $v

    precondition ($v.ok == true) {
      error_type = "badrequest"
      error = $v.message
    }

    conditional {
      if ($v.platform != null) {
        db.edit "Users fans" {
          field_name = "id"
          field_value = $auth.id
          data = {notification_topics: $v.topics, platform: $v.platform}
        } as $me
      }
      else {
        db.edit "Users fans" {
          field_name = "id"
          field_value = $auth.id
          data = {notification_topics: $v.topics}
        } as $me
      }
    }

    api.lambda {
      code = """
        const ALL = ['favorites', 'live', 'top', 'news', 'updates'];
        return $var.v.topics.length ? $var.v.topics : ALL;
      """
      timeout = 10
    } as $topics
  }

  response = $topics
}
