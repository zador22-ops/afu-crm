// R55. Кому слати пуш нового формату. Повертає [{token, follows}], де follows —
// 1 чи 2, якщо людина стежить лише за однією з команд матчу (тоді їй картинкою
// емблема суперника), інакше 0.
// Теми: notification_topics — масив із favorites, live, top, news, updates;
// null або [] = усі увімкнені. Головний перемикач send_notifications і давність
// активності (5 місяців) — як у чинних функціях #6–#8.
function "Push v2 audience" {
  input {
    // match_start, match_finish, match_postponed, half_time, second_half, goal,
    // card, foul, penalty_miss, squad, reminder60, news, update
    text kind filters=trim
    int match_id?
    int team1_id?
    int team2_id?
    // гравці події чи заявки — для тих, хто стежить за гравцем
    json people_ids?
    bool is_top?=false
    // для update — ios або android
    text platform? filters=trim
  }

  stack {
    db.query "Users fans" {
      where = $db.Users_fans.send_notifications == true
      return = {type: "list"}
      output = ["exponent_push_token", "latest_activity", "selected_teaminfo_id", "selected_match_id", "selected_people_id", "notification_topics", "platform"]
    } as $fans

    api.lambda {
      code = """
        const ALL = ['favorites', 'live', 'top', 'news', 'updates'];
        const kind = $input.kind;
        const t1 = Number($input.team1_id) || 0, t2 = Number($input.team2_id) || 0, mid = Number($input.match_id) || 0;
        const people = new Set((Array.isArray($input.people_ids) ? $input.people_ids : []).map(Number).filter(Boolean));
        const edge = Date.now() - 152 * 86400000;
        const arr = (v) => (Array.isArray(v) ? v.map(Number) : []);
        const out = new Map();
        for (const f of $var.fans || []) {
          const token = (f.exponent_push_token || '').trim();
          if (!token) continue;
          const act = f.latest_activity ? Date.parse(f.latest_activity) : 0;
          if (!act || act < edge) continue;
          const topics = Array.isArray(f.notification_topics) && f.notification_topics.length ? f.notification_topics : ALL;
          const on = (t) => topics.includes(t);
          const teams = arr(f.selected_teaminfo_id);
          const f1 = t1 && teams.includes(t1), f2 = t2 && teams.includes(t2);
          const fav = f1 || f2 || (mid && arr(f.selected_match_id).includes(mid)) || arr(f.selected_people_id).some((p) => people.has(p));
          let ok = false;
          if (kind === 'news') ok = on('news');
          else if (kind === 'update') ok = on('updates') && f.platform === $input.platform;
          else if (kind === 'match_start') ok = (fav && on('favorites')) || on('live');
          else if (kind === 'reminder60') ok = (fav && on('favorites')) || ($input.is_top === true && on('top'));
          else ok = fav && on('favorites');
          if (!ok) continue;
          out.set(token, { token, follows: f1 && !f2 ? 1 : f2 && !f1 ? 2 : 0 });
        }
        return [...out.values()];
      """
      timeout = 10
    } as $list
  }

  response = $list
}
