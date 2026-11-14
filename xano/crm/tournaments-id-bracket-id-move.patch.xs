// 14.11.2026 (бриф crm-bracket-editor, п. 1; контракт docs/xano/bracket-position-contract.md):
// Переставити пару сітки на місце position (1…n) у межах її туру — зі зсувом решти, не обмін.
// Право 9, як у решти ендпоінтів сітки. Позиції туру після переміщення — 1…n без пропусків.
query "tournaments/{leagues_id}/bracket/{bracket_id}/move" verb=PATCH {
  api_group = "crm"
  auth = "Users"

  input {
    int leagues_id filters=min:1
    int bracket_id filters=min:1
    int position filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 9, user_id: $auth.id}
    } as $ok
  
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Немає права редагувати сітку"
    }
  
    db.get Bracket {
      field_name = "id"
      field_value = $input.bracket_id
      output = ["id", "tours_id", "position"]
    } as $pair
  
    precondition ($pair != null) {
      error_type = "notfound"
      error = "Пару не знайдено"
    }
  
    db.get Tours {
      field_name = "id"
      field_value = $pair.tours_id
      output = ["id", "leagues_id"]
    } as $tour
  
    precondition ($tour != null && $tour.leagues_id == $input.leagues_id) {
      error_type = "notfound"
      error = "Пара не з цього турніру"
    }
  
    db.query Bracket {
      where = $db.Bracket.tours_id == $pair.tours_id
      sort = {Bracket.position: "asc", Bracket.id: "asc"}
      return = {type: "list"}
      output = ["id", "position"]
    } as $round
  
    api.lambda {
      code = """
        const пара = $var.pair;
        const інші = ($var.round || []).filter((p) => p.id !== пара.id);
        const куди = Math.max(1, Math.min(Number($input.position) || 1, інші.length + 1));
        інші.splice(куди - 1, 0, { id: пара.id, position: пара.position });
        return інші.map((p, i) => ({ id: p.id, old: p.position == null ? null : Number(p.position), position: i + 1 }));
        """
      timeout = 5
    } as $order
  
    db.transaction {
      stack {
        foreach ($order) {
          each as $p {
            conditional {
              if ($p.old != $p.position) {
                db.edit Bracket {
                  field_name = "id"
                  field_value = $p.id
                  data = {position: $p.position}
                } as $moved
              }
            }
          }
        }
      }
    }
  }

  response = {tours_id: $pair.tours_id, order: $order}
}
