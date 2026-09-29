query venues verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text City filters=trim
    text name? filters=trim
    text city? filters=trim
    text address? filters=trim
    int capacity?
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 11, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }
    precondition ($input.City != "") {
      error_type = "badrequest"
      error = "Назва арени порожня"
    }

    // City лишається одним рядком «м. Бровари, БФСК»: ним живуть ADMIN і
    // застосунок. Окремі name/city/address/capacity/photo (рішення Андрія
    // 29.09) — для сайту; вони не замінюють City.
    db.add Venues {
      data = {created_at: "now", City: $input.City, name: $input.name, city: $input.city, address: $input.address, capacity: $input.capacity}
    } as $venue
  }

  response = $venue
}
