query "matches/{match_id}" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
  }

  stack {
    db.query Match {
      where = $db.Match.id == $input.match_id
      return = {type: "single"}
      addon = [
        {
          name  : "TeamInfo"
          output: ["id", "TeamName", "TeamLogo"]
          input : {Teams_id: $output.team1_id}
          as    : "_team1"
        }
        {
          name  : "TeamInfo"
          output: ["id", "TeamName", "TeamLogo"]
          input : {Teams_id: $output.team2_id}
          as    : "_team2"
        }
        {
          name  : "Match_status"
          output: ["Status"]
          input : {Match_status_id: $output.match_status_id}
          as    : "_status"
        }
        {
          name  : "Tours"
          output: ["TourName"]
          input : {Tours_id: $output.tours_id}
          as    : "_tour"
        }
      ]
    } as $match
    precondition ($match != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }

    // can_extend (контракт Backend docs/xano/match-finish-contract.md, бриф match-extra-time):
    // кубок (league.type) або стадія-сітка (League stage.stage_type). Чогось бракує — false.
    db.query Leagues {
      where = $db.Leagues.id == $match.leagues_id
      return = {type: "list"}
      output = ["id", "league_id"]
    } as $ce_leagues
    db.query league {
      return = {type: "list"}
      output = ["id", "type"]
    } as $ce_competitions
    db.query Tours {
      where = $db.Tours.id == $match.tours_id
      return = {type: "list"}
      output = ["id", "league_stage_id"]
    } as $ce_tours
    db.query "League stage" {
      return = {type: "list"}
      output = ["id", "stage_type"]
    } as $ce_stages
    api.lambda {
      code = """
        const ліги = new Map(($var.ce_leagues || []).map((l) => [l.id, l.league_id]));
        const типи = new Map(($var.ce_competitions || []).map((c) => [c.id, c.type]));
        const тури = new Map(($var.ce_tours || []).map((t) => [t.id, t.league_stage_id]));
        const стадії = new Map(($var.ce_stages || []).map((s) => [s.id, s.stage_type]));
        const продовження = (m) => типи.get(ліги.get(m.leagues_id)) === 'кубок' || стадії.get(тури.get(m.tours_id)) === 'сітка';
        return { ...$var.match, can_extend: продовження($var.match) };
      """
      timeout = 10
    } as $ce_out
  }

  response = $ce_out
}
