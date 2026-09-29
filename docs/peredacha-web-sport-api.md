# Спортивні дані для сайту futsal.com.ua — група `site`

Відповідь на afu-crm#3 і пропозицію з afu-crm#1. Стан на 29.09.2026. Усе описане вже живе в Xano.

```
https://xdeg-kg7i-jjtu.f2.xano.io/api:tqrLXZWT
```

Група лише на читання й без авторизації: токен на сайті не потрібен. Після переходу на неї
сайт відкликає токен Metadata API, як домовлялись у #1.

## Чого тут немає навмисно

Ці поля не вибираються з бази взагалі, тож потрапити у відповідь не можуть:

- **Особи й судді:** немає `Date_of_birth` і `po_batkovi`. Замість дати народження віддається лише рік, `birth_year`.
- **Матчі:** немає делегата (`users_idDelegat`), спостерігача (`Sposterigach_ar`), хронометриста (`timekeeper`) і коментарів (`other_comments`).
- **Клуби:** немає контактів (`contact_name`, `contact_phone`, `contact_email`).
- **Новини:** не віддається, хто створив чи редагував новину (див. `peredacha-web-novyny.md`).

## Загальне

- **Зображення** віддаються об'єктом `{url, width, height}` або `null`.
- **Дати й час** — мілісекунди від епохи, UTC. Показуйте за `Europe/Kyiv`. Дати заявок (`Date`, `End_date`) — рядки `YYYY-MM-DD`.
- **Сторінки** є лише в `/matches`: параметри `page` і `per_page` (типово 50, стеля 100), відповідь `{items, total, page, per_page, totalPages}`. Решта списків невеликі й віддаються цілком.
- **Неіснуюче або приховане** → HTTP 404:
  ```json
  {"code": "ERROR_CODE_NOT_FOUND", "message": "Матч не знайдено", "payload": ""}
  ```
  «Приховане» означає турнір із `Relevance = false` (наприклад, «Кубок Нескорених-2025») і його матчі.
- **Неправильний тип параметра** (текст замість числа) → HTTP 400 `ERROR_CODE_INPUT_ERROR`.

## Ендпоінти

### `GET /seasons`
`[{id, name, start_date, end_date, is_current}]`: поточний сезон першим, далі від новішого.
`start_date` і `end_date` поки порожні в базі.

### `GET /leagues?season_id=`
Турніри сезону, упорядковані як у застосунку (`sort_order` змагання). Параметр `season_id` необов'язковий.

```
{ id, name, short_name, logo, season_id, show_in_app, sort_order,
  competition: {id, name, short_name},
  kind: "ліга" | "кубок",
  type: "національний" | "міжнародний",
  stages: [{id, name, type: "таблиця"|"сітка"|"матчі", sort}],
  tours:  [{id, number, name, stage_id, date_from, date_to}] }
```

`date_from` і `date_to` туру — перший і останній матч туру. `show_in_app = false` означає, що
АФУ сховала змагання зі шторки застосунку. Сайт може поводитись так само.

### `GET /leagues/{id}/participants`
`[{teaminfo_id, group_name, withdrawn, club: {id, name, short, logo}}]`

### `GET /leagues/{id}/zones`
`[{id, name, zone_type, color, place_from, place_to, stage_id}]`

- `zone_type`: `playoff`, `promotion`, `europe` або `relegation`.
- `name` — підпис, який ведуть у CRM, або `null`.
- `color` виводиться з типу зони: playoff `#1676BC`, promotion `#1A7F4B`, europe `#FFF200`, relegation `#B42318`. Окремого поля кольору в базі немає.

### `GET /leagues/{id}/table?stage_id=`
Та сама таблиця, що в застосунку: сума рядків таблиці по командах, порядок за очками, різницею
й забитими. Звірено з застосунком 29.09 для Екстра-ліги 2026/27: усі 10 рядків збігаються.
Без `stage_id` береться етап типу «таблиця».

```
{ stage_id, rows: [{place, club, games, wins, draws, losses,
                    goals_for, goals_against, goal_difference, points,
                    zone: {zone_type, name} | null}] }
```

### `GET /matches`

| Параметр | Що робить |
|---|---|
| `league_id` | турнір (`Leagues.id`) |
| `tour_id` | тур |
| `club_id` | матчі клубу, вдома й на виїзді |
| `date_from`, `date_to` | мс або `YYYY-MM-DD`. Дата — це день за Києвом, включно |
| `page`, `per_page` | сторінки, стеля 100 |

Порядок — за часом матчу. Картка матчу:

```
{ id, TimeOfMatch, league_id, tour_id,
  tour: {id, number, name}, stage: {id, name, type},
  match_number,
  teams: [club1, club2],            // {id, name, short, logo}
  result: [goals1, goals2] | null,  // null, поки матч не «Онлайн» чи «Зіграний»
  fouls: {team1: [1-й тайм, 2-й тайм], team2: [...]},  // true, якщо набрано 5 фолів
  status: {id, name},               // 1 Запланований, 2 Перенесений, 3 Онлайн, 4 Зіграний
  venue: {id, name, city},
  referees: [{id, first_name, last_name}],   // до трьох
  is_top, video_id, spectators,
  breaks: [хв 1-го тайм-ауту 1-го тайму, 2-й, хв 1-го тайм-ауту 2-го тайму, 2-й] }
```

### `GET /matches/{id}`
Картка матчу, до якої додано три списки:

- `events` — події протоколу:
  ```
  [{id, minute, type_id, type_name, card: {id, name} | null, goal: {id, name} | null,
    team_id, player: {id, first_name, last_name, number, team_id}, assist: ... | null}]
  ```
- `lineups` — заявка на матч:
  ```
  [{team_id, player: {id, first_name, last_name}, number, position, is_captain, starting}]
  ```
- `staff` — штаб у заявці на матч: `[{team_id, person: {id, first_name, last_name}, position}]`.

`team_id` у події — клуб гравця. Автогол зараховується суперникові (`goal.name`).

### `GET /clubs` і `GET /clubs/{id}`

```
{ id, name, short, logo, team_kind, country, Relevance, parent_teaminfo_id,
  home_venue: {id, name, city} | null, city, founded, colors }
```

- **Список** віддає чинні клуби АФУ разом із суперниками збірної та єврокубків (`team_kind`: `"збірна"` або `"іноземний клуб"`, для клубів АФУ — `null`).
- **Один клуб** віддається будь-який, зокрема архівний: на архівні клуби посилаються старі матчі.
- **`short`** — `null`, короткої назви в базі поки немає.

### `GET /clubs/{id}/squad?league_id=`
Без `league_id` віддаються лише чинні записи заявки. З `league_id` — усі записи клубу в цьому
турнірі, з історією.

```
[{player: {id, first_name, last_name, photo, birth_year, city},
  number, position, Captain, league_id, Date, End_date, Relevance_of_the_record}]
```

### `GET /clubs/{id}/staff`
Штаб клубу одним списком з історією: чинні першими.

```
[{person: {id, first_name, last_name, photo}, position, date_from, date_to, current, league_id}]
```

### `GET /people/{id}`

```
{ id, first_name, last_name, photo, birth_year, city, Growth, Weight,
  career: [{club, league: {id, name}, season: {id, name}, number, date_from, date_to, current}] }
```

### `GET /judges` і `GET /judges/{id}`
`{id, first_name, last_name, photo, birth_year, city, Relevance}`. Список містить лише чинних суддів.

### `GET /venues` і `GET /venues/{id}`
`{id, name, city, address, capacity, photo}`. У базі поки одне текстове поле з містом і назвою
разом («м. Київ, СК ЦСК»). Воно віддається як `name`, решта полів — `null`.

### `GET /event-types`
`{events: [{id, name, code}], cards: [...], goals: [...]}`: типи подій, карток і голів.
`code` поки `null`.

### `GET /staff-cards?match_id=`
Картки штабу матчу:

```
[{id, minute, card: {id, name}, team_id, person: {id, first_name, last_name}, position}]
```

## Чого бракує в базі

Перелік — у `afu-futzal/docs/reports/site-api-missing-fields-2026-09-29.md`:

- окремі назва, місто, адреса, місткість і фото арени;
- коротка назва клубу;
- код події;
- власний колір зони.

Поки полів немає, ці ключі у відповідях є і дорівнюють `null`. Сайт може на них розраховувати: з'явиться поле — з'явиться значення.

## Швидкодія

Списки відповідають за 0,1–0,3 с, картка матчу — за 0,4–0,7 с. Кешуйте їх на боці сайту, як
новини.
