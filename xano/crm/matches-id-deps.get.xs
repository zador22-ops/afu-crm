query "matches/{match_id}/deps" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
    int match_id filters=min:1
  }

  stack {
    // Що саме зникне разом із матчем. Рахуємо ДО видалення, щоб людина бачила
    // ціну дії: у матчі може лежати протокол, заявки обох команд і рядки
    // турнірної таблиці, і жодне з цього не відновлюється.
    db.query Table {
      where = $db.Table.match_id == $input.match_id
      return = {type: "count"}
    } as $table_rows
    db.query Statistic {
      where = $db.Statistic.match_id == $input.match_id
      return = {type: "count"}
    } as $events
    db.query "Statistic Administration of teams" {
      where = $db.Statistic_Administration_of_teams.match_id == $input.match_id
      return = {type: "count"}
    } as $staff_cards
    db.query Zaiuavka {
      where = $db.Zaiuavka.match_id == $input.match_id
      return = {type: "count"}
    } as $squad
    db.query "Zaiuavka administration of teams" {
      where = $db.Zaiuavka_administration_of_teams.match_id == $input.match_id
      return = {type: "count"}
    } as $staff_squad
    db.query "Organization Match" {
      where = $db.Organization_Match.match_id == $input.match_id
      return = {type: "count"}
    } as $organization
    db.query "Team violations" {
      where = $db.Team_violations.match_id == $input.match_id
      return = {type: "count"}
    } as $violations
    db.query "Injury cases" {
      where = $db.Injury_cases.match_id == $input.match_id
      return = {type: "count"}
    } as $injuries
    // Уболівальників тут не рахуємо: `Users fans.selected_match_id` — це
    // МАСИВ обраних матчів, а не одне число, і порівняння «== id» Xano
    // відхиляє. Застаріле число в списку обраного фанатський застосунок
    // переживає: матч просто не знайдеться при читанні.
  }

  response = {
    table_rows  : $table_rows
    events      : $events
    staff_cards : $staff_cards
    squad       : $squad
    staff_squad : $staff_squad
    organization: $organization
    violations  : $violations
    injuries    : $injuries
    total       : $table_rows + $events + $staff_cards + $squad + $staff_squad + $organization + $violations + $injuries
  }
}
