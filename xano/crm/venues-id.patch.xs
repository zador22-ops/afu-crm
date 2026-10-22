query "venues/{venues_id}" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int venues_id filters=min:1
    text City filters=trim
    // Посилання з Google Карт (бриф arena-map, п. 2). Не надіслали — посилання й
    // координати не чіпаємо; надіслали порожнім — стираємо всі три.
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

    db.get Venues {
      field_name = "id"
      field_value = $input.venues_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Арену не знайдено"
    }

    // «Не надіслали» і «надіслали порожнім» для Xano однакові ("" == null),
    // тож розрізняємо за сирим тілом запиту.
    util.get_raw_input {
      encoding = "json"
      exclude_middleware = false
    } as $raw
    api.lambda {
      code = """
        return Object.keys($var.raw || {}).includes('map_url');
      """
      timeout = 10
    } as $map_sent

    var $map {
      value = null
    }
    var $venue {
      value = null
    }

    conditional {
      if ($map_sent) {
        // Координати пише лише сервер: функція Backend розбирає посилання й
        // сама йде за переадресацією короткого maps.app.goo.gl/…
        // (docs/xano/arena-map.md у репо AFU). Не вийшло — map_url лишається,
        // lat/lng = null; порожнє — усі три null.
        function.run "Venue map parse" {
          input = {map_url: $input.map_url}
        } as $parsed
        var.update $map {
          value = $parsed
        }
        db.edit Venues {
          field_name = "id"
          field_value = $input.venues_id
          data = {City: $input.City, map_url: $parsed.map_url, lat: $parsed.lat, lng: $parsed.lng}
        } as $with_map
        var.update $venue {
          value = $with_map
        }
      }
      else {
        db.edit Venues {
          field_name = "id"
          field_value = $input.venues_id
          data = {City: $input.City}
        } as $name_only
        var.update $venue {
          value = $name_only
        }
      }
    }
  }

  // _map — що сказав розбір (kind, message, source): CRM показує message під
  // полем. null — посилання не надсилали.
  response = `$venue|set:"_map":$map`
}
