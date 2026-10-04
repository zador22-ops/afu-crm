// R55. Кожні 15 хв: нагадування за годину (60±15 хв) до матчу — тим, хто
// стежить за командою (тема favorites), і всім із темою top, якщо матч топовий.
// Один раз на матч (push_log, kind reminder60). Чинна задача
// notificationsScheduleMatchReminder (за 30 хв, старий формат) лишається як є.
task push_reminder_60 {
  stack {
    db.query Match {
      where = $db.Match.TimeOfMatch > (now|timestamp_add_minutes:45) && $db.Match.TimeOfMatch <= (now|timestamp_add_minutes:75) && $db.Match.match_status_id == 1
      return = {type: "list"}
      output = ["id"]
    } as $matches

    foreach ($matches) {
      each as $m {
        function.run "Push v2 match status" {
          input = {match_id: $m.id, type_of_event: "reminder60"}
        } as $sent
      }
    }
  }

  schedule = [{starts_on: 2026-10-04 09:15:00+0000, freq: 900}]
}
