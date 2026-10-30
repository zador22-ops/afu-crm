query "club/clubs/{teaminfo_id}/players/{team_id}" verb=PUT {
  api_group = "crm"
  auth = "club_account"

  // Змінити дані гравця свого складу (задача 3.1б; ТЗ 2.2). Клуб надсилає форму
  // цілком; сервер лишає в after лише змінене. Дві чернетки:
  // - person.update (ключ person:<people_id>) — ПІБ, дата народження, місто,
  //   зріст, вага, фото;
  // - squad_row.update (ключ team:<team_id>, leagues_id — турнір): основний
  //   турнір — номер, позиція, капітан (Team); додатковий — лише номер
  //   (team_league, варіант 3).
  // «Лише свої особи» (PM 2, Backend 30.10): особа береться ЛИШЕ з чинного рядка
  // Team цього клубу — People читається після перевірки рядка. Нових осіб із
  // заявок клуб змінює, прибравши й додавши знову. В основні таблиці — нічого.
  input {
    int teaminfo_id filters=min:1
    int team_id filters=min:1
    // {prizvushche, Name, po_batkovi, Date_of_birth, City, Growth, Weight, Photo}
    json person?
    // {leagues_id, Number, positions_id?, Captain?}
    json squad?
    text club_comment? filters=trim
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

    db.get Team {
      field_name = "id"
      field_value = $input.team_id
      output = ["id", "player_id", "teaminfo_id", "leagues_id", "Number", "positions_id", "Captain", "Relevance_of_the_record", "End_date"]
    } as $card
    precondition ($card != null && $card.teaminfo_id == $input.teaminfo_id && $card.Relevance_of_the_record != false) {
      error_type = "accessdenied"
      error = "Це не ваш гравець"
    }
    // Лише тепер — дані особи (вона в чинному складі цього клубу)
    db.get People {
      field_name = "id"
      field_value = $card.player_id
      output = ["id", "prizvushche", "Name", "po_batkovi", "Date_of_birth", "Photo", "City", "Growth", "Weight"]
    } as $person
    db.query team_league {
      where = $db.team_league.teaminfo_id == $input.teaminfo_id && $db.team_league.is_active == true
      return = {type: "list"}
      output = ["id", "team_id", "people_id", "leagues_id", "Number", "End_date"]
    } as $extra
    db.query Team {
      where = $db.Team.teaminfo_id == $input.teaminfo_id && $db.Team.Relevance_of_the_record == true
      return = {type: "list"}
      output = ["id", "player_id", "leagues_id", "Number", "End_date"]
    } as $cards
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Player_position"]
    } as $positions
    db.query change_request {
      where = $db.change_request.teaminfo_id == $input.teaminfo_id && ($db.change_request.status == "draft" || $db.change_request.status == "submitted") && $db.change_request.entity == "squad_row"
      return = {type: "list"}
      output = ["id", "action", "entity_id", "leagues_id", "after"]
    } as $open_rows

    api.lambda {
      code = """
        const зараз = Date.now();
        const сьогодні = new Date(зараз).toISOString().slice(0, 10);
        const k = $var.card;
        const чинна = $var.person || {};
        const рядок = (v) => (v == null ? '' : String(v).trim());
        const шлях = (v) => (v && typeof v === 'object' ? String(v.path || '') : '');
        const діє = (д) => !д.End_date || String(д.End_date) >= сьогодні;
        const ok = { person_fields_ok: true, name_ok: true, dob_ok: true, size_ok: true, photo_ok: true, text_ok: true, league_ok: true, number_ok: true, position_ok: true, comment_ok: true };

        // ——— Особа: лише змінене ———
        const ПОЛЯ_ОСОБИ = ['prizvushche', 'Name', 'po_batkovi', 'Date_of_birth', 'Photo', 'City', 'Growth', 'Weight'];
        const о = $input.person && typeof $input.person === 'object' && !Array.isArray($input.person) ? $input.person : null;
        const person_after = {};
        if (о) {
          for (const п of Object.keys(о)) if (!ПОЛЯ_ОСОБИ.includes(п)) ok.person_fields_ok = false;
          for (const п of ПОЛЯ_ОСОБИ) {
            if (!(п in о)) continue;
            const v = о[п];
            if (п === 'Photo') {
              if (v == null) continue; // прибрати фото не можна — лише замінити
              if (!шлях(v).startsWith('/vault/')) { ok.photo_ok = false; continue; }
              if (шлях(v) !== шлях(чинна.Photo)) person_after.Photo = v;
              continue;
            }
            if (п === 'Growth' || п === 'Weight') {
              if (рядок(v) === '') { if (чинна[п] != null) person_after[п] = null; continue; }
              const ч = Number(v);
              const [від, до] = п === 'Growth' ? [100, 230] : [30, 200];
              if (!Number.isFinite(ч) || ч < від || ч > до) { ok.size_ok = false; continue; }
              if (ч !== Number(чинна[п])) person_after[п] = ч;
              continue;
            }
            if (п === 'Date_of_birth') {
              const д = рядок(v).slice(0, 10);
              if (!/^\d{4}-\d{2}-\d{2}$/.test(д) || Number(д.slice(0, 4)) < 1940 || д > сьогодні) { ok.dob_ok = false; continue; }
              if (д !== String(чинна.Date_of_birth || '').slice(0, 10)) person_after.Date_of_birth = д;
              continue;
            }
            const t = рядок(v);
            if (t.length > 100) ok.text_ok = false;
            if ((п === 'prizvushche' || п === 'Name') && !t) ok.name_ok = false;
            if (t !== рядок(чинна[п])) person_after[п] = t || null;
          }
        }

        // ——— Склад: турнір основний (Team) чи додатковий (team_league) ———
        const с = $input.squad && typeof $input.squad === 'object' && !Array.isArray($input.squad) ? $input.squad : null;
        const squad_after = {};
        let ліга = k.leagues_id;
        if (с) {
          ліга = с.leagues_id ? Number(с.leagues_id) : k.leagues_id;
          const основний = ліга === k.leagues_id;
          const додатковий = ($var.extra || []).find((д) => д.team_id === k.id && д.leagues_id === ліга && діє(д));
          if (!основний && !додатковий) ok.league_ok = false;
          const чинний = основний ? k : додатковий || {};
          if ('Number' in с) {
            const н = Number(с.Number);
            if (!Number.isInteger(н) || н < 1 || н > 99) ok.number_ok = false;
            else if (н !== Number(чинний.Number)) {
              // номер у турнірі: інші чинні Team цього турніру, team_league і відкриті заявки
              const зайнятий = ($var.cards || []).some((x) => x.id !== k.id && x.leagues_id === ліга && діє(x) && Number(x.Number) === н)
                || ($var.extra || []).some((д) => д.team_id !== k.id && д.leagues_id === ліга && діє(д) && Number(д.Number) === н)
                || ($var.open_rows || []).some((r) => r.entity_id !== k.id && r.leagues_id === ліга && r.action !== 'remove' && Number((r.after || {}).Number) === н);
              if (зайнятий) ok.number_ok = false;
              squad_after.Number = н;
            }
          }
          // позиція й капітан — лише в основному рядку Team
          if (основний && 'positions_id' in с) {
            const поз = Number(с.positions_id);
            if (!($var.positions || []).some((p) => p.id === поз && p.Player_position === true)) ok.position_ok = false;
            else if (поз !== Number(k.positions_id)) squad_after.positions_id = поз;
          }
          if (основний && 'Captain' in с && !!с.Captain !== !!k.Captain) squad_after.Captain = !!с.Captain;
        }
        ok.comment_ok = String($input.club_comment || '').length <= 1000;
        return {
          ...ok,
          person_after, person_empty: Object.keys(person_after).length === 0, person_key: 'person:' + k.player_id,
          squad_after, squad_empty: Object.keys(squad_after).length === 0, squad_key: 'team:' + k.id, leagues_id: ліга,
        };
      """
      timeout = 10
    } as $plan

    precondition ($plan.person_fields_ok) {
      error_type = "badrequest"
      error = "Ці дані гравця змінює лише АФУ"
    }
    precondition ($plan.name_ok) {
      error_type = "badrequest"
      error = "Прізвище та ім'я не можуть бути порожніми"
    }
    precondition ($plan.text_ok) {
      error_type = "badrequest"
      error = "Задовгий текст у полі (до 100 знаків)"
    }
    precondition ($plan.dob_ok) {
      error_type = "badrequest"
      error = "Перевірте дату народження"
    }
    precondition ($plan.size_ok) {
      error_type = "badrequest"
      error = "Зріст — 100–230 см, вага — 30–200 кг"
    }
    precondition ($plan.photo_ok) {
      error_type = "badrequest"
      error = "Фото спершу завантажте через форму"
    }
    precondition ($plan.league_ok) {
      error_type = "badrequest"
      error = "Гравець не заявлений клубом у цей турнір"
    }
    precondition ($plan.number_ok) {
      error_type = "badrequest"
      error = "Номер — від 1 до 99 і не зайнятий іншим гравцем цього турніру"
    }
    precondition ($plan.position_ok) {
      error_type = "badrequest"
      error = "Позиція гравця — Воротар або Універсал"
    }
    precondition ($plan.comment_ok) {
      error_type = "badrequest"
      error = "Коментар — до 1000 знаків"
    }

    // Відкриті заявки за ключами (db.get за унікальним open_key)
    db.get change_request {
      field_name = "open_key"
      field_value = $plan.person_key
      output = ["id", "status", "action"]
    } as $open_person
    // Булеві — у лямбді: чи обриває XanoScript «$x == null || $x.поле» на null,
    // не перевірено (рецензія Backend 30.10, жива перевірка 4а)
    api.lambda {
      code = """
        const o = $var.open_person;
        return !o || o.status === 'draft';
      """
      timeout = 5
    } as $person_open_ok
    precondition ($person_open_ok) {
      error_type = "badrequest"
      error = "Зміни даних гравця вже на погодженні — дочекайтесь рішення АФУ або відкличте пакет"
    }
    db.get change_request {
      field_name = "open_key"
      field_value = $plan.squad_key
      output = ["id", "status", "action", "leagues_id"]
    } as $open_squad
    // «Наша» відкрита чернетка складу — update цього ж турніру. Чужу (виведення
    // чи інший турнір) не чіпаємо: порожня зміна складу її не прибирає.
    api.lambda {
      code = """
        const o = $var.open_squad;
        return !!o && o.status === 'draft' && o.action === 'update' && Number(o.leagues_id) === Number($var.plan.leagues_id);
      """
      timeout = 5
    } as $own_squad
    precondition ($plan.squad_empty || $open_squad == null || $own_squad) {
      error_type = "badrequest"
      error = "Для цього гравця вже є відкрита зміна складу (за раз — один турнір) — приберіть її або дочекайтесь рішення АФУ"
    }

    var $acted_by {
      value = $auth.extras|get:"acted_by_users_id":null
    }

    // ——— Чернетка person.update (person:<people_id>) — як club-clubs-id-draft.put: CAS одним SQL ———
    conditional {
      if ($plan.person_empty && $open_person != null) {
        db.direct_query {
          sql = """
            DELETE FROM x1_93 WHERE id = ? AND status = 'draft' RETURNING id;
            """
          response_type = "list"
          arg = $open_person.id
        } as $gone_person
        precondition (($gone_person|count) > 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
      }
    }
    conditional {
      if (!$plan.person_empty && $open_person == null) {
        db.add change_request {
          data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "person", action: "update", entity_id: $card.player_id, people_id: $card.player_id, after: $plan.person_after, status: "draft", open_key: $plan.person_key, target_key: $plan.person_key, club_comment: $input.club_comment}
        } as $added_person
      }
    }
    conditional {
      if (!$plan.person_empty && $open_person != null) {
        db.direct_query {
          sql = """
            UPDATE x1_93 SET "after" = ?::jsonb WHERE id = ? AND status = 'draft' RETURNING id;
            """
          response_type = "list"
          arg = $plan.person_after|json_encode
          arg = $open_person.id
        } as $taken_person
        precondition (($taken_person|count) > 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
        db.edit change_request {
          field_name = "id"
          field_value = $open_person.id
          data = {updated_at: "now", club_account_id: $auth.id, acted_by_users_id: $acted_by, club_comment: $input.club_comment}
        } as $edited_person
      }
    }

    // ——— Чернетка squad_row.update (team:<team_id>) — як club-clubs-id-draft.put: CAS одним SQL ———
    conditional {
      if ($plan.squad_empty && $own_squad) {
        db.direct_query {
          sql = """
            DELETE FROM x1_93 WHERE id = ? AND status = 'draft' RETURNING id;
            """
          response_type = "list"
          arg = $open_squad.id
        } as $gone_squad
        precondition (($gone_squad|count) > 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
      }
    }
    conditional {
      if (!$plan.squad_empty && $open_squad == null) {
        db.add change_request {
          data = {created_at: "now", updated_at: "now", teaminfo_id: $input.teaminfo_id, club_account_id: $auth.id, acted_by_users_id: $acted_by, entity: "squad_row", action: "update", entity_id: $card.id, leagues_id: $plan.leagues_id, people_id: $card.player_id, after: $plan.squad_after, status: "draft", open_key: $plan.squad_key, target_key: $plan.squad_key, club_comment: $input.club_comment}
        } as $added_squad
      }
    }
    conditional {
      if (!$plan.squad_empty && $own_squad) {
        db.direct_query {
          sql = """
            UPDATE x1_93 SET "after" = ?::jsonb, leagues_id = ? WHERE id = ? AND status = 'draft' RETURNING id;
            """
          response_type = "list"
          arg = $plan.squad_after|json_encode
          arg = $plan.leagues_id
          arg = $open_squad.id
        } as $taken_squad
        precondition (($taken_squad|count) > 0) {
          error_type = "badrequest"
          error = "Заявка вже змінилась — оновіть сторінку"
        }
        db.edit change_request {
          field_name = "id"
          field_value = $open_squad.id
          data = {updated_at: "now", club_account_id: $auth.id, acted_by_users_id: $acted_by, club_comment: $input.club_comment}
        } as $edited_squad
      }
    }
  }

  response = {person_after: $plan.person_after, squad_after: $plan.squad_after}
}
