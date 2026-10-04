// R55. Усе про матч, що потрібно тексту пуша: команди з емблемами, рахунок,
// змагання й тур, топ-матч. Емблеми — https-адреси з Xano (для картинки пуша).
function "Push v2 match context" {
  input {
    int match_id
  }

  stack {
    db.get Match {
      field_name = "id"
      field_value = $input.match_id
      output = ["id", "TimeOfMatch", "team1_id", "team2_id", "Result_team1", "Result_team2", "match_status_id", "leagues_id", "tours_id", "is_top"]
    } as $m

    db.get TeamInfo {
      field_name = "id"
      field_value = $m.team1_id
      output = ["id", "TeamName", "TeamLogo"]
    } as $t1

    db.get TeamInfo {
      field_name = "id"
      field_value = $m.team2_id
      output = ["id", "TeamName", "TeamLogo"]
    } as $t2

    db.get Leagues {
      field_name = "id"
      field_value = $m.leagues_id
      output = ["id", "League", "Short_name", "Logo", "league_id"]
    } as $lg

    db.get league {
      field_name = "id"
      field_value = $lg.league_id
      output = ["id", "name", "short_name", "logo"]
    } as $comp

    db.get Tours {
      field_name = "id"
      field_value = $m.tours_id
      output = ["id", "TourName"]
    } as $tour

    api.lambda {
      code = """
        const url = (i) => (i && i.url ? i.url : i && i.path ? 'https://xdeg-kg7i-jjtu.f2.xano.io' + i.path : null);
        const m = $var.m || {};
        const comp = $var.comp || {};
        const lg = $var.lg || {};
        return {
          id: m.id,
          time: m.TimeOfMatch,
          status: m.match_status_id,
          is_top: m.is_top === true,
          team1: { id: m.team1_id, name: ($var.t1 && $var.t1.TeamName) || 'Команда 1', logo: url($var.t1 && $var.t1.TeamLogo) },
          team2: { id: m.team2_id, name: ($var.t2 && $var.t2.TeamName) || 'Команда 2', logo: url($var.t2 && $var.t2.TeamLogo) },
          score: [Number(m.Result_team1) || 0, Number(m.Result_team2) || 0],
          competition: comp.short_name || comp.name || lg.Short_name || lg.League || '',
          tour: ($var.tour && $var.tour.TourName) || '',
          logo: url(comp.logo) || url(lg.Logo),
        };
      """
      timeout = 10
    } as $ctx
  }

  response = $ctx
}
