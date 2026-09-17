query "judges/photo/fill" verb=POST {
  api_group = "crm"
  auth = "Users"

  input {
    // Чиє фото беремо за зразок. Файл не копіюється — усі записи починають
    // посилатися на той самий, що вже лежить у сховищі.
    int source_judges_id filters=min:1
    // Кому саме проставляти: лише тим, у кого зараз стоїть цей шлях.
    // Задається явно, щоб операція була адресною, а не «оновити всіх».
    text replace_path? filters=trim
    // І тим, у кого фото немає взагалі.
    bool include_empty?=true
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 7, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Judges {
      field_name = "id"
      field_value = $input.source_judges_id
    } as $source
    precondition ($source != null && $source.photo != null) {
      error_type = "badrequest"
      error = "У судді-зразка немає фото"
    }

    db.query Judges {
      return = {type: "list"}
    } as $all

    api.lambda {
      code = """
        const шлях = String($input.replace_path || '').trim();
        const зразок = String($var.source.photo && $var.source.photo.path || '');
        const беремо = [];
        for (const j of $var.all || []) {
          if (j.id === Number($input.source_judges_id)) continue;
          const свій = String(j.photo && j.photo.path || '');
          // Своє, відмінне від битого й від зразка, не чіпаємо ніколи:
          // сенс операції — закрити порожнечу, а не стерти реальні фото.
          if (!свій) { if ($input.include_empty) беремо.push(j.id); continue; }
          if (шлях && свій === шлях) беремо.push(j.id);
        }
        return {ids: беремо, sample: зразок};
      """
      timeout = 10
    } as $plan

    foreach ($plan.ids) {
      each as $id {
        db.edit Judges {
          field_name = "id"
          field_value = $id
          data = {photo: $source.photo}
        } as $upd
      }
    }
  }

  response = {updated: `$plan.ids|count`, source: $plan.sample}
}
