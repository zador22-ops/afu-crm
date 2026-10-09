query "game-admin/winners/redefine" verb=POST {
  api_group = "crm"
  auth = "Users"

  // «Перевизначити переможця» місяця (game-api.md, «Для CRM»): лише 7 днів після
  // закриття, поки рядки місяця ще є. Ховає результат чинного переможця й видаляє
  // його рядок game_season_winner — наступний щогодинний запуск «Game close months»
  // обере нового з наявних рядків. Для серпня ще й видаляє запис «Залу слави»
  // сезону: запуск перерахує його.
  input {
    text month filters=trim
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 20, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.query game_season_winner {
      where = $db.game_season_winner.month == $input.month
      return = {type: "single"}
    } as $w
    precondition ($w != null) {
      error_type = "notfound"
      error = "Для цього місяця переможця ще немає"
    }

    db.query game_month_best {
      where = $db.game_month_best.month == $input.month
      return = {type: "count"}
    } as $rows

    api.lambda {
      code = """
        const m = String($input.month || '');
        if (!/^\d{4}-\d{2}$/.test(m)) return { ok: false, message: 'Місяць у форматі 2026-09' };
        const [y, mo] = m.split('-').map(Number);
        const ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1;
        const utc = Date.UTC(ny, nm - 1, 1);
        const off = new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })) - new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' }));
        const closed = utc - off;
        if (Date.now() >= closed + 7 * 86400000) return { ok: false, message: 'Минуло понад 7 днів після закриття місяця — перевизначити вже не можна' };
        if (!(Number($var.rows) > 0)) return { ok: false, message: 'Рядків місяця вже немає — новий переможець не обереться' };
        return { ok: true, message: '', august: mo === 8 };
      """
      timeout = 10
    } as $v
    precondition ($v.ok == true) {
      error_type = "badrequest"
      error = $v.message
    }

    conditional {
      if ($w.fans_id != null) {
        db.query game_month_best {
          where = $db.game_month_best.month == $input.month && $db.game_month_best.fans_id == $w.fans_id
          return = {type: "single"}
        } as $best
        conditional {
          if ($best != null) {
            db.edit game_month_best {
              field_name = "id"
              field_value = $best.id
              data = {hidden: true}
            } as $hid
          }
        }
      }
    }

    db.del game_season_winner {
      field_name = "id"
      field_value = $w.id
    }

    var $hall_deleted {
      value = 0
    }
    conditional {
      if ($v.august) {
        db.query game_hall_of_fame {
          where = $db.game_hall_of_fame.season == $w.season
          return = {type: "single"}
        } as $h
        conditional {
          if ($h != null) {
            db.del game_hall_of_fame {
              field_name = "id"
              field_value = $h.id
            }
            var.update $hall_deleted {
              value = 1
            }
          }
        }
      }
    }
  }

  response = {month: $input.month, previous_fans_id: $w.fans_id, previous_nick: $w.nick_snapshot, hall_deleted: $hall_deleted, note: "Новий переможець обереться найближчим щогодинним запуском (о :05)"}
}
