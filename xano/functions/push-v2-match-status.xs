// R55. Двійник #8 PushNotificationsOtherEvents у новому форматі: початок,
// кінець, перенесення / новий час, перерва, другий тайм і нове нагадування
// за годину. Поки push_config.live = false, справжнім уболівальникам іде
// старий формат через саму #8 (крім reminder60 і time_change — їх у #8 немає).
function "Push v2 match status" {
  input {
    int match_id
    // status (за поточним статусом матчу), finish first half, start second half,
    // reminder60, time_change
    text type_of_event filters=trim
    bool dry_run?=false
    // false — не дублювати старим форматом (#8): виклики, які до R55 пушів не слали
    bool legacy?=true
  }

  stack {
    db.get push_config {
      field_name = "id"
      field_value = 1
    } as $cfg

    conditional {
      if ($cfg.live != true && $input.dry_run != true && $input.legacy && ($input.type_of_event == "status" || $input.type_of_event == "finish first half" || $input.type_of_event == "start second half")) {
        function.run PushNotificationsOtherEvents {
          input = {match_id: $input.match_id, type_of_event: $input.type_of_event}
        } as $old
      }
    }

    function.run "Push v2 match context" {
      input = {match_id: $input.match_id}
    } as $ctx

    api.lambda {
      code = """
        const c = $var.ctx, ev = $input.type_of_event;
        const рахунок = `${c.score[0]}:${c.score[1]}`;
        const змагання = [c.competition, c.is_top ? 'топ-матч туру' : c.tour].filter(Boolean).join(' · ');
        const коли = (ms) => {
          if (!ms) return '';
          const d = new Date(ms);
          const день = d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Kyiv' });
          const час = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });
          return `${день}, ${час}`;
        };
        let kind = '', body = '';
        if (ev === 'status' && c.status === 3) { kind = 'match_start'; body = `🔴 Матч почався · ${змагання}`; }
        else if (ev === 'status' && c.status === 4) { kind = 'match_finish'; body = `🏁 Кінець матчу · ${рахунок}`; }
        else if (ev === 'status' && c.status === 2) { kind = 'match_postponed'; body = `⏰ Матч перенесено${c.time ? ' · тепер ' + коли(c.time) : ''}`; }
        else if (ev === 'time_change') { kind = 'time_change'; body = `⏰ Змінено час · тепер ${коли(c.time)}`; }
        else if (ev === 'finish first half') { kind = 'half_time'; body = `⏸ Перерва · ${рахунок}`; }
        else if (ev === 'start second half') { kind = 'second_half'; body = `▶️ Другий тайм · ${рахунок}`; }
        else if (ev === 'reminder60') { kind = 'reminder60'; body = `⏳ Початок за годину · ${змагання}`; }
        // Один пуш на матч для подій, які не повторюються; час — щоразу новий
        const once = ['match_start', 'match_finish', 'half_time', 'second_half', 'reminder60'].includes(kind);
        const ref = kind === 'time_change' || kind === 'match_postponed' ? `${c.id}:${c.time}` : String(c.id);
        const tpl = kind === 'reminder60' && c.is_top ? 'reminder60_top' : kind;
        const vars = { home: c.team1.name, away: c.team2.name, competition: c.competition, tour: c.tour, score: рахунок, time: коли(c.time) };
        return { kind, tpl, vars, ref, once, title: `${c.team1.name} — ${c.team2.name}`, body };
      """
      timeout = 10
    } as $text

    var $sent {
      value = null
    }
    var $r {
      value = {enabled: false}
    }

    conditional {
      if ($text.kind != "") {
        function.run "Push v2 render" {
          input = {tpl: $text.tpl, vars: $text.vars, fallback_title: $text.title, fallback_body: $text.body}
        } as $rendered
        var.update $r {
          value = $rendered
        }
      }
    }

    conditional {
      if ($text.kind != "" && $r.enabled) {
        function.run "Push v2 audience" {
          input = {kind: $text.kind, match_id: $input.match_id, team1_id: $ctx.team1.id, team2_id: $ctx.team2.id, is_top: $ctx.is_top}
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
          input = {kind: $text.kind, ref: $text.ref, messages: $messages, dry_run: $input.dry_run, once: $text.once}
        } as $delivered
        var.update $sent {
          value = $delivered
        }
      }
    }
  }

  response = {text: $text, sent: $sent}
}
