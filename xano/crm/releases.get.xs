query releases verb=GET {
  api_group = "crm"
  auth = "Users"

  // R57. Журнал релізів усіх застосунків, нові першими.
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

    db.query app_release {
      sort = {app_release.released_at: "desc"}
      return = {type: "list"}
      addon = [
        {
          name  : "Users"
          output: ["Name"]
          input : {Users_id: $output.created_by}
          as    : "_by"
        }
      ]
    } as $list
  }

  response = $list
}
