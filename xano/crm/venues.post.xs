query venues verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    text City filters=trim
    // Посилання з Google Карт (бриф arena-map, п. 2); порожнє чи немає — без карти
    text map_url?
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

    // Координати пише лише сервер (функція Backend «Venue map parse»,
    // docs/xano/arena-map.md у репо AFU). Порожнє посилання вона повертає як
    // kind empty з трьома null — тож викликаємо завжди.
    function.run "Venue map parse" {
      input = {map_url: $input.map_url}
    } as $map

    // Місто й об'єкт живуть одним рядком («м. Бровари, БФСК») — так само, як їх
    // показує застосунок у картці матчу. Розділяти поле тут не можна: на нього
    // дивиться ADMIN і фанатський застосунок.
    db.add Venues {
      data = {created_at: "now", City: $input.City, map_url: $map.map_url, lat: $map.lat, lng: $map.lng}
    } as $venue
  }

  response = `$venue|set:"_map":$map`
}
