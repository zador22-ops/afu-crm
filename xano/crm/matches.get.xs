query matches verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int tours_id?=0
  }

  stack {
    conditional {
      if ($input.tours_id > 0) {
        db.query Match {
          where = $db.Match.leagues_id == $input.leagues_id && $db.Match.tours_id == $input.tours_id
          sort = {Match.TimeOfMatch: "asc"}
          return = {type: "list"}
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
        } as $matches
      }
      else {
        db.query Match {
          where = $db.Match.leagues_id == $input.leagues_id
          sort = {Match.TimeOfMatch: "asc"}
          return = {type: "list"}
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
        } as $matches
      }
    }

    // can_extend (контракт Backend docs/xano/match-finish-contract.md, бриф match-extra-time):
    // кубок (league.type) або стадія-сітка (League stage.stage_type). Чогось бракує — false.
    db.query Leagues {
      where = $db.Leagues.id == $input.leagues_id
      return = {type: "list"}
      output = ["id", "league_id"]
    } as $ce_leagues
    db.query league {
      return = {type: "list"}
      output = ["id", "type"]
    } as $ce_competitions
    db.query Tours {
      where = $db.Tours.leagues_id == $input.leagues_id
      return = {type: "list"}
      output = ["id", "league_stage_id"]
    } as $ce_tours
    db.query "League stage" {
      return = {type: "list"}
      output = ["id", "stage_type"]
    } as $ce_stages

    // R59 (PM 2, 08.11): рахунок матчу без серії пенальті, як у Default (docs/xano/match-score-penalty.md).
    // Result у базі містить серію (голи на 51-й хвилині), тож до кожного матчу додаємо
    // score = Result мінус серія і penalty = [серія1, серія2] або null. Наявні поля не змінюються.
    db.direct_query {
      sql = """
        SELECT s.match_id, t.teaminfo_id, COUNT(*) AS n
          FROM x1_11 s JOIN x1_7 t ON t.id = s.team_id
         WHERE s.minute = 51 AND s.types_of_match_events_id = 1
         GROUP BY s.match_id, t.teaminfo_id
        """
      response_type = "list"
    } as $r59_so

    api.lambda {
      code = """
        const С = {};
        for (const s of $var.r59_so || []) (С[s.match_id] ||= {})[s.teaminfo_id] = Number(s.n);
        const додати = (m) => {
          const s = С[m.id];
          const p1 = s ? s[m.team1_id] || 0 : 0, p2 = s ? s[m.team2_id] || 0 : 0;
          const r1 = m.Result_team1, r2 = m.Result_team2;
          m.score = r1 == null && r2 == null ? null : [Math.max(0, (Number(r1) || 0) - p1), Math.max(0, (Number(r2) || 0) - p2)];
          m.penalty = s ? [p1, p2] : null;
        };
        const ліги = new Map(($var.ce_leagues || []).map((l) => [l.id, l.league_id]));
        const типи = new Map(($var.ce_competitions || []).map((c) => [c.id, c.type]));
        const тури = new Map(($var.ce_tours || []).map((t) => [t.id, t.league_stage_id]));
        const стадії = new Map(($var.ce_stages || []).map((s) => [s.id, s.stage_type]));
        const продовження = (m) => типи.get(ліги.get(m.leagues_id)) === 'кубок' || стадії.get(тури.get(m.tours_id)) === 'сітка';
        const out = JSON.parse(JSON.stringify($var.matches ?? []));
        out.forEach((m) => { додати(m); m.can_extend = продовження(m); });
        return out;
      """
      timeout = 10
    } as $r59_out
  }

  response = $r59_out
}
