query "club/clubs/{teaminfo_id}/upload" verb=POST {
  api_group = "crm"
  auth = "club_account"

  // Зображення для чернетки (емблема, фото команди; задача 2.1): лише у vault,
  // повертаємо об'єкт файлу, а в основну таблицю він потрапить тільки після
  // погодження АФУ (контракт 1.1, п. 4). Обрізку робить CRM до завантаження.
  input {
    int teaminfo_id filters=min:1
    file image
  }

  stack {
    // СТОРОЖ «лише свій клуб» (контракт 1.1, п. 2.2) — однаковий текст у
    // кожному клубному ендпоінті з teaminfo_id; src/utils/clubGuard.test.js
    // перевіряє, що він є і стоїть до будь-якого читання даних клубу.
    db.get club_account {
      field_name = "id"
      field_value = $auth.id
    } as $guard_account
    precondition ($guard_account != null && $guard_account.is_active) {
      error_type = "accessdenied"
      error = "Акаунт клубу вимкнено. Зверніться до АФУ"
    }
    db.query club_account_club {
      where = $db.club_account_club.club_account_id == $auth.id && $db.club_account_club.teaminfo_id == $input.teaminfo_id && $db.club_account_club.is_active == true
      return = {type: "count"}
    } as $guard_own
    precondition ($guard_own > 0) {
      error_type = "accessdenied"
      error = "Це не ваш клуб"
    }
    // /СТОРОЖ

    // До 5 МБ і лише зображення (ТЗ 6); тип перевіряє ще й storage.create_image
    api.lambda {
      code = """
        const f = $input.image || {};
        const тип = String(f.mime || f.type || '');
        return { size_ok: !f.size || Number(f.size) <= 5 * 1024 * 1024, type_ok: !тип || тип.startsWith('image/') };
      """
      timeout = 10
    } as $file_check
    precondition ($file_check.size_ok) {
      error_type = "badrequest"
      error = "Файл більший за 5 МБ"
    }
    precondition ($file_check.type_ok) {
      error_type = "badrequest"
      error = "Можна лише зображення (PNG чи JPG)"
    }

    storage.create_image {
      value = $input.image
      access = "public"
      filename = ""
    } as $img
  }

  response = {image: $img}
}
