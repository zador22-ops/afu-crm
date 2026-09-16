query "matches/{match_id}" verb=DELETE {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
    // Без цього прапорця матч із протоколом, заявкою чи рядками таблиці не
    // видаляється. Прапорець ставить людина у вікні підтвердження, побачивши
    // числа з `matches/{id}/deps`.
    bool force?=false
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 2, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get Match {
      field_name = "id"
      field_value = $input.match_id
    } as $was
    precondition ($was != null) {
      error_type = "notfound"
      error = "Матч не знайдено"
    }

    db.query Table {
      where = $db.Table.match_id == $input.match_id
      return = {type: "list"}
      output = ["id"]
    } as $table_rows
    db.query Statistic {
      where = $db.Statistic.match_id == $input.match_id
      return = {type: "list"}
      output = ["id"]
    } as $events
    db.query "Statistic Administration of teams" {
      where = $db.Statistic_Administration_of_teams.match_id == $input.match_id
      return = {type: "list"}
      output = ["id"]
    } as $staff_cards
    db.query Zaiuavka {
      where = $db.Zaiuavka.match_id == $input.match_id
      return = {type: "list"}
      output = ["id"]
    } as $squad
    db.query "Zaiuavka administration of teams" {
      where = $db.Zaiuavka_administration_of_teams.match_id == $input.match_id
      return = {type: "list"}
      output = ["id"]
    } as $staff_squad
    db.query "Organization Match" {
      where = $db.Organization_Match.match_id == $input.match_id
      return = {type: "list"}
      output = ["id"]
    } as $organization
    db.query "Team violations" {
      where = $db.Team_violations.match_id == $input.match_id
      return = {type: "list"}
      output = ["id"]
    } as $violations
    db.query "Injury cases" {
      where = $db.Injury_cases.match_id == $input.match_id
      return = {type: "list"}
      output = ["id"]
    } as $injuries

    // Арифметика над `|count` у var не проходить («Not numeric»), тому рахунок
    // збираємо лямбдою — заразом віддамо ці ж числа у відповіді.
    api.lambda {
      code = """
        const n = (x) => (Array.isArray(x) ? x.length : 0);
        const c = {
          table_rows: n($var.table_rows),
          events: n($var.events),
          staff_cards: n($var.staff_cards),
          squad: n($var.squad),
          staff_squad: n($var.staff_squad),
          organization: n($var.organization),
          violations: n($var.violations),
          injuries: n($var.injuries),
        };
        c.total = Object.values(c).reduce((a, b) => a + b, 0);
        return c;
      """
      timeout = 10
    } as $counts

    precondition ($input.force || $counts.total == 0) {
      error_type = "badrequest"
      error = "До матчу привʼязані протокол, заявка або рядки таблиці. Підтвердьте видалення разом із ними"
    }

    // Порядок обовʼязковий: спершу те, що посилається на матч, потім сам матч.
    // Фото прикріплені не до матчу, а до пункту організації, тож ідуть першими.
    foreach ($organization) {
      each as $org {
        db.query "Organization Match Photos" {
          where = $db.Organization_Match_Photos.organization_match_id == $org.id
          return = {type: "list"}
          output = ["id"]
        } as $photos
        foreach ($photos) {
          each as $photo {
            db.del "Organization Match Photos" {
              field_name = "id"
              field_value = $photo.id
            }
          }
        }
        db.del "Organization Match" {
          field_name = "id"
          field_value = $org.id
        }
      }
    }
    foreach ($events) {
      each as $row {
        db.del Statistic {
          field_name = "id"
          field_value = $row.id
        }
      }
    }
    foreach ($staff_cards) {
      each as $row {
        db.del "Statistic Administration of teams" {
          field_name = "id"
          field_value = $row.id
        }
      }
    }
    foreach ($squad) {
      each as $row {
        db.del Zaiuavka {
          field_name = "id"
          field_value = $row.id
        }
      }
    }
    foreach ($staff_squad) {
      each as $row {
        db.del "Zaiuavka administration of teams" {
          field_name = "id"
          field_value = $row.id
        }
      }
    }
    foreach ($table_rows) {
      each as $row {
        db.del Table {
          field_name = "id"
          field_value = $row.id
        }
      }
    }
    foreach ($violations) {
      each as $row {
        db.del "Team violations" {
          field_name = "id"
          field_value = $row.id
        }
      }
    }
    foreach ($injuries) {
      each as $row {
        db.del "Injury cases" {
          field_name = "id"
          field_value = $row.id
        }
      }
    }

    db.del Match {
      field_name = "id"
      field_value = $input.match_id
    }
  }

  // Що саме знесено — щоб у звіті стояли числа, а не «видалено».
  response = {deleted: 1, removed: $counts}
}
