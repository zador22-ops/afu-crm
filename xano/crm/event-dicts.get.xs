query "event-dicts" verb=GET {
  api_group = "crm"
  auth = "Users"

  input {
  }

  stack {
    db.query "Types of match events" {
      sort = {Types_of_match_events.id: "asc"}
      return = {type: "list"}
    } as $events
    db.query "Types of cards" {
      sort = {Types_of_cards.id: "asc"}
      return = {type: "list"}
    } as $cards
    db.query "Types of goals" {
      sort = {Types_of_goals.id: "asc"}
      return = {type: "list"}
    } as $goals
  }

  response = {events: $events, cards: $cards, goals: $goals}
}
