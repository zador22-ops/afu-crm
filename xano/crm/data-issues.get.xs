query "data-issues" verb=GET {
  api_group = "crm"
  auth = "Users"

  // «Проблеми з даними» (бриф crm-data-issues, слово Андрія 23.10). ЛИШЕ
  // ЧИТАННЯ: жодного запису. Правила — ті самі, що в аудиті Backend
  // (docs/xano/drafts/data-audit-2026-10.mjs у репо AFU), щоб числа
  // збігались: сезон — is_current; турніри — Leagues сезону з Relevance ≠
  // false; майбутні — статус 1/2 і (немає часу чи час ≥ зараз); зіграні — 4;
  // діюча картка — Relevance_of_the_record ≠ false і End_date порожня чи
  // ≥ сьогодні; номер 0 = немає; «без часу» = 00:00 за Києвом; «без
  // протоколу» = ні Statistic, ні Zaiuavka.
  //
  // Нова перевірка — ще один виклик перевірка(…) у лямбді нижче й тест у
  // src/utils/dataIssues.test.js (він виконує саме цю лямбду на фікстурах).
  input {
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 12, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query Season {
      return = {type: "list"}
      output = ["id", "name", "is_current"]
    } as $seasons
    db.query Leagues {
      return = {type: "list"}
      output = ["id", "League", "season_id", "Relevance", "league_id", "main"]
    } as $leagues
    db.query league {
      return = {type: "list"}
      output = ["id", "show_in_app"]
    } as $competitions
    db.query Match {
      return = {type: "list"}
      output = ["id", "TimeOfMatch", "team1_id", "team2_id", "leagues_id", "tours_id", "venues_id", "match_status_id", "referee1_id", "users_idDelegat", "Result_team1", "Result_team2"]
    } as $matches
    db.query Statistic {
      return = {type: "list"}
      output = ["match_id"]
    } as $events
    db.query Zaiuavka {
      return = {type: "list"}
      output = ["match_id"]
    } as $squads
    db.query Team {
      return = {type: "list"}
      output = ["id", "player_id", "teaminfo_id", "Number", "leagues_id", "positions_id", "Relevance_of_the_record", "End_date"]
    } as $cards
    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Name", "Photo", "Date_of_birth"]
    } as $people
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "TeamLogo", "TeamInfo", "home_venues_id"]
    } as $clubs
    db.query Venues {
      return = {type: "list"}
      output = ["id", "City", "map_url", "lat", "lng"]
    } as $venues
    db.query "Administration of teams" {
      return = {type: "list"}
      output = ["id", "people_id", "teaminfo_id", "positions_id", "Relevance_of_the_record", "end_date", "leagues_id"]
    } as $staff
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Player_position"]
    } as $positions
    db.query Tours {
      return = {type: "list"}
      output = ["id", "leagues_id", "league_stage_id"]
    } as $tours
    db.query "League stage" {
      return = {type: "list"}
      output = ["id", "stage_type"]
    } as $stages
    db.query Table {
      return = {type: "list"}
      output = ["leagues_id", "teaminfo_id"]
    } as $table
    db.query league_zone {
      return = {type: "list"}
      output = ["leagues_id", "league_stage_id"]
    } as $zones
    db.query "Tournament participants" {
      return = {type: "list"}
      output = ["leagues_id", "teaminfo_id", "withdrawn"]
    } as $participants
    // Без пароля: лише id, ім'я, роль, актуальність
    db.query Users {
      return = {type: "list"}
      output = ["id", "Name", "types_of_user_roles_id", "Relevance"]
    } as $users

    api.lambda {
      code = """
        const зараз = Date.now();
        const ДЕНЬ = 86400000;
        const МАКС = 1000;
        const список = (x) => (Array.isArray(x) ? x : []);
        const є = (v) => v !== null && v !== undefined && v !== '' && v !== 0;
        const фото = (v) => Boolean(v && (v.path || v.url));
        const київ = (ms, o) => new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', ...o }).format(new Date(ms));
        const київГодина = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
        const сьогодні = new Date(зараз).toISOString().slice(0, 10);

        const сезон = список($var.seasons).find((s) => s.is_current) || null;
        if (!сезон) return { season: null, checked_at: зараз, checks: [] };

        const ліги = список($var.leagues).filter((l) => l.season_id === сезон.id && l.Relevance !== false);
        const лігиId = new Set(ліги.map((l) => l.id));
        const ліга = new Map(ліги.map((l) => [l.id, l]));
        const змагання = new Map(список($var.competitions).map((c) => [c.id, c]));
        const клуб = new Map(список($var.clubs).map((k) => [k.id, k]));
        const людина = new Map(список($var.people).map((p) => [p.id, p]));
        const позиція = new Map(список($var.positions).map((p) => [p.id, p]));
        const етап = new Map(список($var.stages).map((e) => [e.id, e]));

        const матчі = список($var.matches).filter((m) => лігиId.has(m.leagues_id));
        const майбутні = матчі.filter((m) => [1, 2].includes(m.match_status_id) && (!m.TimeOfMatch || m.TimeOfMatch >= зараз));
        const зіграні = матчі.filter((m) => m.match_status_id === 4);
        const лічильник = (рядки) => { const м = new Map(); for (const r of список(рядки)) м.set(r.match_id, (м.get(r.match_id) || 0) + 1); return м; };
        const подіїЗа = лічильник($var.events);
        const заявкиЗа = лічильник($var.squads);

        const учасники = список($var.participants).filter((u) => лігиId.has(u.leagues_id) && !u.withdrawn);
        const клубиId = new Set([...учасники.map((u) => u.teaminfo_id), ...матчі.flatMap((m) => [m.team1_id, m.team2_id])].filter((x) => x > 0));
        const клуби = [...клубиId].map((id) => клуб.get(id)).filter(Boolean);

        const діюча = (k) => k.Relevance_of_the_record !== false && (!k.End_date || k.End_date >= сьогодні);
        const картки = список($var.cards).filter((k) => лігиId.has(k.leagues_id) && діюча(k));
        const штаб = список($var.staff).filter((a) => a.Relevance_of_the_record !== false && (!a.end_date || a.end_date >= сьогодні) && (лігиId.has(a.leagues_id) || клубиId.has(a.teaminfo_id)));

        // ——— Підписи й посилання ———
        const назваКлубу = (id) => (клуб.get(id) && клуб.get(id).TeamName) || ('клуб ' + id);
        const ім = (p) => (p ? [p.prizvushche, p.Name].filter(Boolean).join(' ') : '');
        const коли = (m) => (m.TimeOfMatch ? київ(m.TimeOfMatch, { day: '2-digit', month: '2-digit', year: 'numeric' }) + (київГодина(m.TimeOfMatch) === '00:00' ? '' : ', ' + київГодина(m.TimeOfMatch)) : 'без дати');
        const матч = (m, розклад) => ({
          type: 'match',
          id: m.id,
          label: коли(m) + ' · ' + назваКлубу(m.team1_id) + ' — ' + назваКлубу(m.team2_id),
          sub: (ліга.get(m.leagues_id) || {}).League || '',
          link: розклад ? '/tournaments/' + m.leagues_id + '?tab=matches&edit=' + m.id : '/matches/' + m.id,
        });
        const клубОб = (k, вкладка) => ({ type: 'club', id: k.id, label: k.TeamName || ('клуб ' + k.id), link: '/clubs/' + k.id + (вкладка ? '?tab=' + вкладка : '') });
        const арена = (a) => ({ type: 'venue', id: a.id, label: a.City || ('арена ' + a.id), link: '/venues?edit=' + a.id });
        const турнір = (l, вкладка) => ({ type: 'tournament', id: l.id, label: l.League || ('турнір ' + l.id), link: '/tournaments/' + l.id + (вкладка ? '?tab=' + вкладка : '') });
        const особа = (p, sub) => ({ type: 'person', id: p.id, label: ім(p) || ('особа ' + p.id), sub, link: '/people?q=' + encodeURIComponent(ім(p)) });

        const checks = [];
        const перевірка = (code, level, title, seen, fix, items, total) => {
          checks.push({ code, level, title, seen, fix, count: items.length, total: total === undefined ? null : total, truncated: items.length > МАКС, items: items.slice(0, МАКС) });
        };

        // ——— Критично ———
        перевірка('played_no_protocol', 'critical', 'Зіграний матч без протоколу',
          'Рахунок без авторів голів, порожні склади й хронологія',
          'Внесіть заявку й події на сторінці матчу',
          зіграні.filter((m) => !подіїЗа.get(m.id) && !заявкиЗа.get(m.id)).map((m) => матч(m)), зіграні.length);

        перевірка('past_not_played', 'critical', 'Матч у минулому досі «Запланований» чи «Перенесений» без нової дати',
          'Висить як майбутній, без рахунку',
          'Внесіть результат на сторінці матчу або поставте нову дату в розкладі',
          матчі.filter((m) => m.TimeOfMatch && ((m.match_status_id === 1 && зараз - m.TimeOfMatch > 3 * 3600000) || (m.match_status_id === 2 && m.TimeOfMatch < зараз))).map((m) => матч(m)));

        const скоро = майбутні.filter((m) => m.TimeOfMatch && m.TimeOfMatch - зараз <= 14 * ДЕНЬ);
        перевірка('future_no_delegate_soon', 'critical', 'Матч найближчих 14 днів без делегата',
          'Делегат не побачить матч у «Моїх матчах» — у CRM і ADMIN 2.0',
          'Призначте делегата в картці матчу в розкладі турніру',
          скоро.filter((m) => !є(m.users_idDelegat)).map((m) => матч(m, true)), скоро.length);

        перевірка('live_too_long', 'critical', '«Онлайн» чи «Призупинено» довше 3 годин',
          'У застосунку матч «іде» годинами',
          'Завершіть або перенесіть матч на сторінці матчу',
          матчі.filter((m) => [3, 5].includes(m.match_status_id) && m.TimeOfMatch && зараз - m.TimeOfMatch > 3 * 3600000).map((m) => матч(m)));

        // ——— Важливо ———
        const пізніше = майбутні.filter((m) => !(m.TimeOfMatch && m.TimeOfMatch - зараз <= 14 * ДЕНЬ));
        перевірка('future_no_delegate_later', 'important', 'Майбутній матч без делегата (далі ніж 14 днів)',
          'Поки нічого; за два тижні до гри стане критичним',
          'Призначте делегата в картці матчу в розкладі турніру',
          пізніше.filter((m) => !є(m.users_idDelegat)).map((m) => матч(m, true)), пізніше.length);

        перевірка('future_no_referee', 'important', 'Майбутній матч без суддів',
          'На «Інфо» матчу немає арбітрів',
          'Призначте арбітрів у картці матчу в розкладі турніру',
          майбутні.filter((m) => !є(m.referee1_id)).map((m) => матч(m, true)), майбутні.length);

        перевірка('future_no_time', 'important', 'Майбутній матч без часу',
          'Дата без години',
          'Поставте час у картці матчу в розкладі турніру',
          майбутні.filter((m) => !m.TimeOfMatch || київГодина(m.TimeOfMatch) === '00:00').map((m) => матч(m, true)), майбутні.length);

        const гравець = (k) => {
          const p = людина.get(k.player_id);
          return { type: 'card', id: k.id, label: ім(p) || ('гравець ' + k.player_id), sub: назваКлубу(k.teaminfo_id) + (є(k.Number) ? ', №' + k.Number : '') + ' · ' + ((ліга.get(k.leagues_id) || {}).League || ''), link: '/clubs/' + k.teaminfo_id + '?tab=roster' };
        };
        перевірка('card_no_number', 'important', 'Гравець у складі без номера',
          'У складі — без кружечка з номером',
          'Внесіть номер у складі клубу',
          картки.filter((k) => !є(k.Number)).map(гравець), картки.length);

        const дублі = [];
        {
          const групи = new Map();
          for (const k of картки) {
            if (!є(k.Number)) continue;
            const ключ = k.leagues_id + ':' + k.teaminfo_id + ':' + k.Number;
            if (!групи.has(ключ)) групи.set(ключ, []);
            групи.get(ключ).push(k);
          }
          for (const кк of групи.values()) {
            if (new Set(кк.map((k) => k.player_id)).size < 2) continue;
            const k = кк[0];
            дублі.push({ type: 'club', id: k.teaminfo_id, label: назваКлубу(k.teaminfo_id) + ': №' + k.Number, sub: кк.map((x) => ім(людина.get(x.player_id)) || ('гравець ' + x.player_id)).join(', '), link: '/clubs/' + k.teaminfo_id + '?tab=roster' });
          }
        }
        перевірка('number_duplicate', 'important', 'Однаковий номер у двох гравців клубу',
          'У складі двоє з тим самим номером',
          'Змініть номер одному з гравців у складі клубу',
          дублі);

        const аренаМайбутніх = new Set(майбутні.map((m) => m.venues_id).filter((x) => x > 0));
        const безПосилання = (a) => !String(a.map_url || '').trim();
        перевірка('venue_future_no_map', 'important', 'Арена майбутніх матчів без посилання на карту',
          'Замість карти — «Знайти на картах» (пошук за назвою)',
          'Вставте посилання з Google Карт на сторінці «Арени»',
          список($var.venues).filter((a) => аренаМайбутніх.has(a.id) && безПосилання(a)).map(арена),
          список($var.venues).filter((a) => аренаМайбутніх.has(a.id)).length);

        const учасниківЗа = (id) => new Set(учасники.filter((u) => u.leagues_id === id).map((u) => u.teaminfo_id));
        перевірка('empty_tournament_shown', 'important', 'Порожній турнір, що показується в застосунку',
          'Порожній турнір у списку змагань',
          'Додайте учасників і матчі або сховайте змагання в розділі «Змагання»',
          ліги.filter((l) => (змагання.get(l.league_id) || {}).show_in_app !== false && (учасниківЗа(l.id).size === 0 || !матчі.some((m) => m.leagues_id === l.id)))
            .map((l) => ({ ...турнір(l, 'participants'), sub: 'учасників ' + учасниківЗа(l.id).size + ', матчів ' + матчі.filter((m) => m.leagues_id === l.id).length })));

        перевірка('table_stage_no_zones', 'important', 'Табличний етап без зон',
          'Таблиця без кольорових зон (плей-оф, виліт)',
          'Налаштуйте зони у вкладці «Зони» турніру',
          ліги.filter((l) => {
            const табличні = [...new Set(список($var.tours).filter((t) => t.leagues_id === l.id).map((t) => t.league_stage_id))].filter((id) => id > 0 && (етап.get(id) || {}).stage_type === 'таблиця');
            return табличні.some((id) => !список($var.zones).some((z) => z.leagues_id === l.id && z.league_stage_id === id));
          }).map((l) => турнір(l, 'zones')));

        // Лише турніри, де таблиця вже є: до першого зіграного матчу рядків немає, і це не помилка
        перевірка('participants_vs_table', 'important', 'Учасники турніру не збігаються з таблицею',
          'У таблиці бракує команди чи є зайва',
          'Звірте учасників турніру з командами в таблиці',
          ліги.map((l) => {
            const уч = учасниківЗа(l.id);
            const вТаблиці = new Set(список($var.table).filter((r) => r.leagues_id === l.id).map((r) => r.teaminfo_id));
            if (!вТаблиці.size) return null;
            const нема = [...уч].filter((x) => !вТаблиці.has(x));
            const зайві = [...вТаблиці].filter((x) => !уч.has(x));
            if (!нема.length && !зайві.length) return null;
            return { ...турнір(l, 'participants'), sub: 'учасників ' + уч.size + ', у таблиці ' + вТаблиці.size + (нема.length ? '; немає в таблиці: ' + нема.map(назваКлубу).join(', ') : '') + (зайві.length ? '; зайві в таблиці: ' + зайві.map(назваКлубу).join(', ') : '') };
          }).filter(Boolean));

        // ——— Рекомендація ———
        перевірка('club_no_home_venue', 'advice', 'Клуб-учасник без домашньої арени',
          'На сторінці клубу немає рядка домашньої арени',
          'Оберіть домашню арену в картці клубу',
          клуби.filter((k) => !є(k.home_venues_id)).map((k) => клубОб(k)), клуби.length);

        перевірка('venue_no_map', 'advice', 'Інша арена без посилання на карту',
          'Замість карти — «Знайти на картах»',
          'Вставте посилання з Google Карт на сторінці «Арени»',
          список($var.venues).filter((a) => !аренаМайбутніх.has(a.id) && безПосилання(a)).map(арена));

        перевірка('played_no_officials', 'advice', 'Зіграний матч без делегата чи суддів',
          'На «Інфо» матчу немає рядка «Делегат» чи арбітрів',
          'Внесіть делегата й арбітрів у картці матчу в розкладі турніру',
          зіграні.filter((m) => !є(m.users_idDelegat) || !є(m.referee1_id)).map((m) => ({ ...матч(m, true), sub: [(ліга.get(m.leagues_id) || {}).League, !є(m.users_idDelegat) ? 'без делегата' : '', !є(m.referee1_id) ? 'без суддів' : ''].filter(Boolean).join(' · ') })), зіграні.length);

        const гравціСезону = [...new Set(картки.map((k) => k.player_id))].map((id) => людина.get(id)).filter(Boolean);
        const безПозиції = new Set(картки.filter((k) => !є(k.positions_id)).map((k) => k.player_id));
        перевірка('players_incomplete', 'advice', 'Гравець без фото, дати народження чи позиції',
          'Заглушка замість фото, немає віку чи амплуа',
          'Доповніть картку особи (фото, дата народження) або позицію в складі клубу',
          гравціСезону.filter((p) => !фото(p.Photo) || !p.Date_of_birth || безПозиції.has(p.id))
            .map((p) => особа(p, [!фото(p.Photo) ? 'без фото' : '', !p.Date_of_birth ? 'без дати народження' : '', безПозиції.has(p.id) ? 'без позиції' : ''].filter(Boolean).join(', '))),
          гравціСезону.length);

        перевірка('staff_incomplete', 'advice', 'Штаб без фото чи ролі',
          'Заглушка замість фото чи немає посади',
          'Доповніть фото особи або роль у штабі клубу',
          штаб.filter((a) => !фото((людина.get(a.people_id) || {}).Photo) || !є(a.positions_id) || (позиція.get(a.positions_id) || {}).Player_position === true)
            .map((a) => {
              const p = людина.get(a.people_id);
              const роль = !є(a.positions_id) ? 'без ролі' : (позиція.get(a.positions_id) || {}).Player_position === true ? 'роль гравця замість посади' : '';
              return { type: 'staff', id: a.id, label: ім(p) || ('особа ' + a.people_id), sub: назваКлубу(a.teaminfo_id) + ' · ' + [!фото(p && p.Photo) ? 'без фото' : '', роль].filter(Boolean).join(', '), link: '/clubs/' + a.teaminfo_id + '?tab=staff' };
            }),
          штаб.length);

        перевірка('club_no_logo_or_city', 'advice', 'Клуб без логотипа чи міста',
          'Заглушка замість емблеми чи немає міста',
          'Доповніть картку клубу',
          клуби.filter((k) => !фото(k.TeamLogo) || !String(k.TeamInfo || '').trim())
            .map((k) => ({ ...клубОб(k), sub: [!фото(k.TeamLogo) ? 'без логотипа' : '', !String(k.TeamInfo || '').trim() ? 'без міста' : ''].filter(Boolean).join(', ') })), клуби.length);

        const призначені = new Map();
        for (const m of майбутні) if (є(m.users_idDelegat)) призначені.set(m.users_idDelegat, (призначені.get(m.users_idDelegat) || 0) + 1);
        перевірка('inactive_delegate_assigned', 'advice', 'Неактуальний обліковий запис делегата на майбутньому матчі',
          'Делегат не зможе увійти й вести матч',
          'Призначте іншого делегата або поверніть запис у «Користувачах»',
          список($var.users).filter((u) => призначені.has(u.id) && (u.Relevance === false || ![1, 2].includes(u.types_of_user_roles_id)))
            .map((u) => ({ type: 'user', id: u.id, label: u.Name || ('користувач ' + u.id), sub: 'майбутніх матчів: ' + призначені.get(u.id) + (u.Relevance === false ? ' · неактуальний' : ' · не делегат'), link: '/users' })));

        return { season: { id: сезон.id, name: сезон.name }, checked_at: зараз, checks };
      """
      timeout = 20
    } as $result
  }

  response = $result
}
