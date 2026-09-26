query clubs verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text TeamName filters=trim
    text TeamInfo? filters=trim
    bool Relevance?=true
    int leagues_id?
    int parent_teaminfo_id?
    int founded_year?
    int home_venues_id?
    text website? filters=trim
    text instagram? filters=trim
    text facebook? filters=trim
    text youtube? filters=trim
    text colors? filters=trim
    text contact_name? filters=trim
    text contact_phone? filters=trim
    text contact_email? filters=trim
    text team_kind? filters=trim
    text country? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 5, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.TeamName != "") {
      error_type = "badrequest"
      error = "Назва клубу порожня"
    }

    precondition ($input.team_kind == null || $input.team_kind == "" || $input.team_kind == "збірна" || $input.team_kind == "іноземний клуб") {
      error_type = "badrequest"
      error = "Вид команди має бути порожнім (клуб АФУ), «збірна» або «іноземний клуб»"
    }

    // Суперник (R20): Relevance = false і без турніру й материнського клубу —
    // так він не з'являється в списках і пікерах команд ADMIN (#18, #121)
    var $kind {
      value = null
    }
    var $relevance {
      value = $input.Relevance
    }
    var $leagues {
      value = $input.leagues_id
    }
    var $parent {
      value = $input.parent_teaminfo_id
    }
    conditional {
      if ($input.team_kind != null && $input.team_kind != "") {
        var.update $kind {
          value = $input.team_kind
        }
        var.update $relevance {
          value = false
        }
        var.update $leagues {
          value = null
        }
        var.update $parent {
          value = null
        }
      }
    }

    db.add TeamInfo {
      data = {
        created_at        : "now"
        TeamName          : $input.TeamName
        TeamInfo          : $input.TeamInfo
        Relevance         : $relevance
        leagues_id        : $leagues
        parent_teaminfo_id: $parent
        founded_year      : $input.founded_year
        home_venues_id    : $input.home_venues_id
        website           : $input.website
        instagram         : $input.instagram
        facebook          : $input.facebook
        youtube           : $input.youtube
        colors            : $input.colors
        contact_name      : $input.contact_name
        contact_phone     : $input.contact_phone
        contact_email     : $input.contact_email
        team_kind         : $kind
        country           : $input.country
      }
    } as $club
  }

  response = $club
}
