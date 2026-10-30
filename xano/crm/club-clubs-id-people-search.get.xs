query "club/clubs/{teaminfo_id}/people-search" verb=GET {
  api_group = "crm"
  auth = "club_account"

  // Пошук особи перед додаванням гравця (задача 3.1; ТЗ 2.2): обов'язково
  // прізвище І дата народження — збіг повертається лише тоді, коли клуб уже
  // знає обидва (не перебір чужих дат народження). Показує, у якому клубі
  // особа зараз активна — щоб клуб бачив, що це буде перехід.
  input {
    int teaminfo_id filters=min:1
    text q filters=trim
    text dob filters=trim
  }

  stack {
    // СТОРОЖ «лише свій клуб» (контракт 1.1, п. 2.2) — однаковий текст у
    // кожному клубному ендпоінті з teaminfo_id; src/utils/clubGuard.test.js
    // перевіряє, що він є і стоїть до будь-якого читання даних клубу.
    db.get club_account {
      field_name = "id"
      field_value = $auth.id
    } as $guard_account
    precondition ($guard_account != null && $guard_account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }
    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $auth.id && $db.club_account_club.teaminfo_id == $input.teaminfo_id && $db.club_account_club.is_active == true
      return = {type: "count"}
    } as $guard_own
    precondition ($guard_own > 0) {
      error_type = "accessdenied"
      error = "Це не ваш клуб"
    }
    // /СТОРОЖ

    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Name", "Date_of_birth"]
    } as $people
    db.query Team {
      where = $db.Team.Relevance_of_the_record != false
      return = {type: "list"}
      output = ["player_id", "teaminfo_id", "leagues_id", "End_date"]
    } as $cards
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName"]
    } as $teams

    api.lambda {
      code = """
        const норм = (s) => String(s || '').trim().toLowerCase().replace(/[’ʼ`]/g, "'");
        const q = норм($input.q);
        const dob = String($input.dob || '').trim();
        if (q.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return { ok: false, people: [] };
        const сьогодні = new Date().toISOString().slice(0, 10);
        const клуб = new Map(($var.teams || []).map((t) => [t.id, t.TeamName]));
        const люди = ($var.people || []).filter((p) => норм(p.prizvushche) === q && String(p.Date_of_birth || '').slice(0, 10) === dob);
        return {
          ok: true,
          people: люди.map((p) => ({
            // Мінімум, щоб упізнати двійника (PM 2): без по батькові, фото й точної дати чужої людини
            id: p.id, prizvushche: p.prizvushche, Name: p.Name, birth_year: Number(String(p.Date_of_birth || '').slice(0, 4)) || null,
            active_clubs: [...new Set(($var.cards || []).filter((k) => k.player_id === p.id && (!k.End_date || String(k.End_date) >= сьогодні)).map((k) => k.teaminfo_id))]
              .map((id) => ({ teaminfo_id: id, name: клуб.get(id) || null })),
          })),
        };
      """
      timeout = 10
    } as $found
    precondition ($found.ok) {
      error_type = "badrequest"
      error = "Вкажіть прізвище і дату народження"
    }
  }

  response = {people: $found.people}
}
