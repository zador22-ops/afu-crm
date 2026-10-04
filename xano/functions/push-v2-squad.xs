// R55. Двійник #6 PushNotificationsZayavka у новому форматі: склад команди
// на матч оголошено. Кличе CRM/ADMIN 2.0 при збереженні заявки — раніше вони
// пушів про заявку не слали, тож старого формату для справжніх уболівальників
// тут немає: поки push_config.live = false, лише test_tokens.
function "Push v2 squad" {
  input {
    int match_id
    int teaminfo_id
    bool dry_run?=false
  }

  stack {
    function.run "Push v2 match context" {
      input = {match_id: $input.match_id}
    } as $ctx

    db.query Zaiuavka {
      join = {
        Team: {table: "Team", where: $db.Team.id == $db.Zaiuavka.team_id}
      }

      where = $db.Zaiuavka.match_id == $input.match_id && $db.Team.teaminfo_id == $input.teaminfo_id
      return = {type: "list"}
      output = ["team_id"]
      addon = [
        {
          name  : "Team"
          output: ["player_id"]
          input : {Team_id: $output.team_id}
          as    : "_team"
        }
      ]
    } as $rows

    api.lambda {
      code = """
        const c = $var.ctx;
        const team = Number($input.teaminfo_id) === c.team1.id ? c.team1 : c.team2;
        const змагання = [c.competition, c.is_top ? 'топ-матч туру' : c.tour].filter(Boolean).join(' · ');
        return {
          title: `${c.team1.name} — ${c.team2.name}`,
          body: `📋 Склад ${team.name} оголошено${змагання ? ' · ' + змагання : ''}`,
          people: ($var.rows || []).map((r) => r._team && r._team.player_id).filter(Boolean),
          ref: `${c.id}:${team.id}`,
          count: ($var.rows || []).length,
        };
      """
      timeout = 10
    } as $text

    var $sent {
      value = null
    }

    conditional {
      if ($text.count > 0) {
        function.run "Push v2 audience" {
          input = {kind: "squad", match_id: $input.match_id, team1_id: $ctx.team1.id, team2_id: $ctx.team2.id, people_ids: $text.people}
        } as $aud

        api.lambda {
          code = """
            const c = $var.ctx, t = $var.text;
            const by = { 0: [], 1: [], 2: [] };
            for (const a of $var.aud || []) by[a.follows].push(a.token);
            const img = { 0: c.logo, 1: c.team2.logo, 2: c.team1.logo };
            return [0, 1, 2].filter((k) => by[k].length || k === 0).map((k) => ({ to: by[k], title: t.title, body: t.body, data: { match_id: c.id }, image: img[k] || c.logo || null }));
          """
          timeout = 10
        } as $messages

        function.run "Push v2 deliver" {
          input = {kind: "squad", ref: $text.ref, messages: $messages, dry_run: $input.dry_run, once: true}
        } as $delivered
        var.update $sent {
          value = $delivered
        }
      }
    }
  }

  response = {text: $text, sent: $sent}
}
