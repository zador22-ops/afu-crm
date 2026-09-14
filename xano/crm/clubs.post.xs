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
      error_type = "input"
      error = "Назва клубу порожня"
    }

    db.add TeamInfo {
      data = {
        created_at        : "now"
        TeamName          : $input.TeamName
        TeamInfo          : $input.TeamInfo
        Relevance         : $input.Relevance
        leagues_id        : $input.leagues_id
        parent_teaminfo_id: $input.parent_teaminfo_id
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
      }
    } as $club
  }

  response = $club
}
