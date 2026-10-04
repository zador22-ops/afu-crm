// R55. Двійник #7 PushNotificationsMatchEvents у новому форматі: заголовок
// «Команда — Команда», тіло зі значком, гравцем, хвилиною й рахунком, data
// {match_id}, картинка — емблема суперника тієї команди, за якою стежить людина.
// Вхід той самий, що в #7. Поки push_config.live = false, справжнім
// уболівальникам іде старий формат через саму #7 — як і було.
function "Push v2 match event" {
  input {
    int match_id?
    int team_id?
    int types_of_match_events_id?
    int types_of_cards_id?
    int types_of_goals_id?
    // 1001 — подія члена штабу (team_id тоді — рядок Administration of teams)
    int minute?
    bool dry_run?=false
  }

  stack {
    db.get push_config {
      field_name = "id"
      field_value = 1
    } as $cfg

    conditional {
      if ($cfg.live != true && $input.dry_run != true) {
        function.run PushNotificationsMatchEvents {
          input = {
            match_id                : $input.match_id
            team_id                 : $input.team_id
            types_of_match_events_id: $input.types_of_match_events_id
            types_of_cards_id       : $input.types_of_cards_id
            types_of_goals_id       : $input.types_of_goals_id
            minute                  : $input.minute
          }
        } as $old
      }
    }

    function.run "Push v2 match context" {
      input = {match_id: $input.match_id}
    } as $ctx

    var $who {
      value = null
    }
    var $yellows {
      value = 0
    }
    var $sent {
      value = null
    }
    var $r {
      value = null
    }

    conditional {
      if ($input.minute == 1001) {
        db.get "Administration of teams" {
          field_name = "id"
          field_value = $input.team_id
          output = ["people_id", "teaminfo_id"]
          addon = [
            {
              name  : "People"
              output: ["prizvushche"]
              input : {People_id: $output.people_id}
              as    : "_people"
            }
          ]
        } as $staff
        var.update $who {
          value = {people_id: $staff.people_id, surname: $staff._people.prizvushche, teaminfo_id: $staff.teaminfo_id, staff: true}
        }
        db.query "Statistic Administration of teams" {
          where = $db.Statistic_Administration_of_teams.match_id == $input.match_id && $db.Statistic_Administration_of_teams.administration_of_teams_id == $input.team_id && $db.Statistic_Administration_of_teams.types_of_cards_id == 2
          return = {type: "count"}
        } as $y
        var.update $yellows {
          value = $y
        }
      }
      else {
        db.get Team {
          field_name = "id"
          field_value = $input.team_id
          output = ["player_id", "teaminfo_id"]
          addon = [
            {
              name  : "People"
              output: ["prizvushche"]
              input : {People_id: $output.player_id}
              as    : "_people"
            }
          ]
        } as $player
        var.update $who {
          value = {people_id: $player.player_id, surname: $player._people.prizvushche, teaminfo_id: $player.teaminfo_id, staff: false}
        }
        db.query Statistic {
          where = $db.Statistic.match_id == $input.match_id && $db.Statistic.team_id == $input.team_id && $db.Statistic.types_of_cards_id == 2
          return = {type: "count"}
        } as $y
        var.update $yellows {
          value = $y
        }
      }
    }

    api.lambda {
      code = """
        const c = $var.ctx, w = $var.who || {};
        const ev = Number($input.types_of_match_events_id), goal = Number($input.types_of_goals_id), card = Number($input.types_of_cards_id);
        const team = Number(w.teaminfo_id) === c.team1.id ? c.team1 : Number(w.teaminfo_id) === c.team2.id ? c.team2 : null;
        const хв = !w.staff && Number($input.minute) > 0 && Number($input.minute) < 100 ? `${$input.minute}′` : '';
        const vars = {
          home: c.team1.name, away: c.team2.name, competition: c.competition, tour: c.tour,
          score: `${c.score[0]}:${c.score[1]}`,
          player: ((w.surname || '').trim() + (w.staff ? ', штаб' : '')).trim(),
          team: team ? team.name : '', minute: хв,
          half: Number($input.minute) < 20 ? '1-й тайм' : '2-й тайм',
        };
        let kind = '', tpl = '', body = '';
        const хто = `${vars.player}${vars.team ? ' (' + vars.team + ')' : ''}${хв ? ', ' + хв : ''}`;
        if (ev === 1) {
          kind = 'goal';
          tpl = { 1: 'goal', 2: 'goal_own', 3: 'goal_penalty', 4: 'goal_double_penalty' }[goal] || 'goal';
          const що = { 1: 'Гол!', 2: 'Автогол!', 3: 'Гол з пенальті!', 4: 'Гол з дабл-пенальті!' }[goal] || 'Гол!';
          body = `⚽ ${що} ${хто} · ${vars.score}`;
        } else if (ev === 2) {
          kind = 'card';
          if (card === 1) { tpl = 'card_red'; body = `🟥 Червона картка · ${хто}`; }
          else if (Number($var.yellows) >= 2) { tpl = 'card_second_yellow'; body = `🟨🟥 Друга жовта · ${хто}`; }
          else { tpl = 'card_yellow'; body = `🟨 Жовта картка · ${хто}`; }
        } else if (ev === 3) {
          kind = 'penalty_miss';
          tpl = goal === 4 ? 'double_penalty_miss' : 'penalty_miss';
          body = `❌ ${goal === 4 ? 'Не забитий дабл-пенальті' : 'Не забитий пенальті'} · ${хто}`;
        } else if (ev === 4) {
          kind = 'foul';
          tpl = 'foul';
          body = `⚠️ Пʼятий фол · ${vars.team} · ${vars.half}`;
        }
        const ref = `${$input.match_id}:${$input.team_id}:${$input.types_of_match_events_id}:${$input.minute}`;
        return { kind, tpl, ref, vars, title: `${c.team1.name} — ${c.team2.name}`, body, people: w.people_id ? [w.people_id] : [] };
      """
      timeout = 10
    } as $text

    conditional {
      if ($text.kind != "") {
        function.run "Push v2 render" {
          input = {tpl: $text.tpl, vars: $text.vars, fallback_title: $text.title, fallback_body: $text.body}
        } as $r
      }
    }

    conditional {
      if ($text.kind != "" && $r.enabled) {
        function.run "Push v2 audience" {
          input = {kind: $text.kind, match_id: $input.match_id, team1_id: $ctx.team1.id, team2_id: $ctx.team2.id, people_ids: $text.people}
        } as $aud

        api.lambda {
          code = """
            const c = $var.ctx, t = $var.r;
            const by = { 0: [], 1: [], 2: [] };
            for (const a of $var.aud || []) by[a.follows].push(a.token);
            const img = { 0: c.logo, 1: c.team2.logo, 2: c.team1.logo };
            return [0, 1, 2].filter((k) => by[k].length || k === 0).map((k) => ({ to: by[k], title: t.title, body: t.body, data: { match_id: c.id }, image: img[k] || c.logo || null }));
          """
          timeout = 10
        } as $messages

        function.run "Push v2 deliver" {
          input = {kind: $text.kind, ref: $text.ref, messages: $messages, dry_run: $input.dry_run}
        } as $delivered
        var.update $sent {
          value = $delivered
        }
      }
    }
  }

  response = {text: $text, sent: $sent}
}
