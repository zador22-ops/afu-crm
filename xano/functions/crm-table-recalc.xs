function "CRM table recalc" {
  // Приводить рядки турнірної таблиці одного матчу до того, що зараз у подіях.
  // Викликається з кожного запису CRM, який може змінити результат: подія
  // протоколу, рахунок, статус матчу, видалення події.
  //
  // ЧИМ ВІДРІЗНЯЄТЬСЯ ВІД СТАРОЇ ЛОГІКИ ADMIN (POST /statistic #62, /match #4, #5)
  // 1. Дублі. Стара логіка робить «знайти рядок → якщо немає, створити», і два
  //    паралельні запити обидва не знаходять і обидва створюють. У базі так
  //    зʼявилось 6 дубльованих пар. Тут зайві рядки прибираються в тому ж
  //    виклику: лишається рівно один на команду.
  // 2. Етап. #62 не заповнює `league_stage_id`, тому 14 рядків у базі без
  //    етапу, а таблиця читається саме за `leagues_id + league_stage_id`.
  //    Тут етап проставляється завжди — і при створенні, і при правці, тобто
  //    старі рядки полагодяться самі, щойно матч чіпатимуть із CRM.
  // 3. Умова. #62 не дивиться ні на статус, ні на тип етапу, тому гол у
  //    запланованому матчі або в кубковій сітці створює рядки таблиці. Тут
  //    рядки існують лише коли матч зіграний (статус > 2) і етап типу
  //    «таблиця»; інакше вони видаляються.
  //
  // Автогол (`types_of_goals_id == 2`) зараховується суперникові — так само,
  // як у старій логіці; це єдине, що звідти перенесено без змін.

  input {
    int match_id?
  }

  stack {
    db.get Match {
      field_name = "id"
      field_value = $input.match_id
      output = ["id", "team1_id", "team2_id", "leagues_id", "tours_id", "match_status_id", "Result_team1", "Result_team2"]
    } as $match

    db.get Tours {
      field_name = "id"
      field_value = $match.tours_id
      output = ["id", "league_stage_id"]
    } as $tour

    db.get "League stage" {
      field_name = "id"
      field_value = $tour.league_stage_id
      output = ["id", "stage_type"]
    } as $stage

    db.query Statistic {
      join = {
        Team: {table: "Team", where: $db.Team.id == $db.Statistic.team_id}
      }

      where = $db.Statistic.match_id == $input.match_id && ($db.Team.teaminfo_id == $match.team1_id && $db.Statistic.types_of_match_events_id == 1 && $db.Statistic.types_of_goals_id != 2 || $db.Team.teaminfo_id == $match.team2_id && $db.Statistic.types_of_goals_id == 2)
      return = {type: "count"}
    } as $goals1

    db.query Statistic {
      join = {
        Team: {table: "Team", where: $db.Team.id == $db.Statistic.team_id}
      }

      where = $db.Statistic.match_id == $input.match_id && ($db.Team.teaminfo_id == $match.team2_id && $db.Statistic.types_of_match_events_id == 1 && $db.Statistic.types_of_goals_id != 2 || $db.Team.teaminfo_id == $match.team1_id && $db.Statistic.types_of_goals_id == 2)
      return = {type: "count"}
    } as $goals2

    // Скільки взагалі подій-голів у матчі. Нуль означає технічний результат
    // (неявка, знята команда): рахунок у такому матчі вводиться руками й подій
    // не має. Без цієї перевірки перерахунок «з подій» обнулив би його.
    db.query Statistic {
      where = $db.Statistic.match_id == $input.match_id && $db.Statistic.types_of_match_events_id == 1
      return = {type: "count"}
    } as $goal_events

    db.query Table {
      where = $db.Table.match_id == $input.match_id && $db.Table.teaminfo_id == $match.team1_id
      sort = {Table.id: "asc"}
      return = {type: "list"}
      output = ["id"]
    } as $rows1

    db.query Table {
      where = $db.Table.match_id == $input.match_id && $db.Table.teaminfo_id == $match.team2_id
      sort = {Table.id: "asc"}
      return = {type: "list"}
      output = ["id"]
    } as $rows2

    api.lambda {
      code = """
        const ids = (x) => (Array.isArray(x) ? x.map((r) => r.id) : []);
        const a = ids($var.rows1);
        const b = ids($var.rows2);
        // Є події — рахунок рахується з них; немає жодної — матч технічний,
        // і джерелом лишається те, що введено в картці матчу.
        const зПодій = Number($var.goal_events) > 0;
        const g1 = зПодій ? Number($var.goals1) || 0 : Number($var.match.Result_team1) || 0;
        const g2 = зПодій ? Number($var.goals2) || 0 : Number($var.match.Result_team2) || 0;
        return {
          goals1: g1,
          goals2: g2,
          from_events: зПодій,
          keep1: a[0] || 0,
          keep2: b[0] || 0,
          // Зайві рядки тієї ж пари матч+команда — це дублі гонки в старій логіці
          extra: a.slice(1).concat(b.slice(1)),
          all: a.concat(b),
          points1: g1 > g2 ? 3 : g1 === g2 ? 1 : 0,
          points2: g2 > g1 ? 3 : g1 === g2 ? 1 : 0,
          diff1: g1 - g2,
          diff2: g2 - g1,
          // Рядок таблиці має існувати лише для зіграного матчу в етапі-таблиці
          should: Number($var.match.match_status_id) > 2 && String($var.stage.stage_type) === 'таблиця',
          // А от прибирати рядки можна тільки в НЕзіграного матчу. Рішення
          // Андрія 17.09: рядки шести зіграних кубкових матчів, які колись
          // створила стара логіка всупереч власному правилу, лишаються як є —
          // вони ні в яку таблицю не потрапляють (етап порожній), а видалення
          // було б зміною даних реальних матчів. Без цієї умови будь-яка
          // правка такого матчу в CRM тихо скасувала б те рішення.
          may_clear: Number($var.match.match_status_id) <= 2,
        };
      """
      timeout = 10
    } as $c

    conditional {
      if ($c.should) {
        conditional {
          if ($c.keep1 != 0) {
            db.edit Table {
              field_name = "id"
              field_value = $c.keep1
              data = {
                Games          : 1
                Goals_scored   : $c.goals1
                Conceded_goals : $c.goals2
                Goal_difference: $c.diff1
                Points         : $c.points1
                leagues_id     : $match.leagues_id
                league_stage_id: $tour.league_stage_id
              }
            } as $upd1
          }
          else {
            db.add Table {
              data = {
                created_at     : "now"
                teaminfo_id    : $match.team1_id
                match_id       : $input.match_id
                Games          : 1
                Goals_scored   : $c.goals1
                Conceded_goals : $c.goals2
                Goal_difference: $c.diff1
                Points         : $c.points1
                leagues_id     : $match.leagues_id
                league_stage_id: $tour.league_stage_id
              }
            } as $new1
          }
        }

        conditional {
          if ($c.keep2 != 0) {
            db.edit Table {
              field_name = "id"
              field_value = $c.keep2
              data = {
                Games          : 1
                Goals_scored   : $c.goals2
                Conceded_goals : $c.goals1
                Goal_difference: $c.diff2
                Points         : $c.points2
                leagues_id     : $match.leagues_id
                league_stage_id: $tour.league_stage_id
              }
            } as $upd2
          }
          else {
            db.add Table {
              data = {
                created_at     : "now"
                teaminfo_id    : $match.team2_id
                match_id       : $input.match_id
                Games          : 1
                Goals_scored   : $c.goals2
                Conceded_goals : $c.goals1
                Goal_difference: $c.diff2
                Points         : $c.points2
                leagues_id     : $match.leagues_id
                league_stage_id: $tour.league_stage_id
              }
            } as $new2
          }
        }

        foreach ($c.extra) {
          each as $id {
            db.del Table {
              field_name = "id"
              field_value = $id
            }
          }
        }
      }
      else {
        // Матч не зіграний — рядків бути не повинно. Зіграний кубковий матч
        // із давніми рядками не чіпаємо: див. may_clear вище.
        conditional {
          if ($c.may_clear) {
        foreach ($c.all) {
          each as $id {
            db.del Table {
              field_name = "id"
              field_value = $id
            }
          }
        }
          }
        }
      }
    }

    // Рахунок у самому матчі теж тримаємо рівним подіям — так робить і #62.
    db.edit Match {
      field_name = "id"
      field_value = $input.match_id
      data = {Result_team1: $c.goals1, Result_team2: $c.goals2}
    } as $saved
  }

  response = {
    goals1  : $c.goals1
    goals2  : $c.goals2
    from_events: $c.from_events
    points1 : $c.points1
    points2 : $c.points2
    in_table: $c.should
    removed : `$c.extra|count`
  }
}
