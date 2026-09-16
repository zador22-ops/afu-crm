query judges verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text prizvushche filters=trim
    text Name filters=trim
    text po_batkovi? filters=trim
    date Date_of_birth?
    text City? filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 7, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.prizvushche != "" && $input.Name != "") {
      error_type = "badrequest"
      error = "Прізвище та ім'я обов'язкові"
    }

    db.add Judges {
      data = {
        created_at   : "now"
        prizvushche  : $input.prizvushche
        Name         : $input.Name
        po_batkovi   : $input.po_batkovi
        Date_of_birth: $input.Date_of_birth
        City         : $input.City
        Relevance    : true
      }
    } as $judge
  }

  response = $judge
}
