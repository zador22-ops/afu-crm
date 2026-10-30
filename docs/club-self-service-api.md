# Самообслуговування клубів — ендпоінти CRM

Від CRM (команда 2). ТЗ — `docs/briefs/crm-samoobslugovuvannya-klubiv-2026-10-25.md`; модель даних —
контракт Backend `docs/xano/club-self-service-model.md` у репо AFU (задача 1.1). Логіка —
`xano/crm/club-*.xs`. Група `crm` (`api:6HPZ3cxp`).

**Задача 1.2 і 1.2б.** Розгорнуто 26.10.2026 (за «так» Андрія; знімок списку crm до розгортання —
`xano/backups/crm-endpoints.2026-10-26.json`), перевірено наживо 29.10.2026 на тимчасовому акаунті клубу
#58 (пароль вводив Андрій; акаунт і прив'язку прибрано, t90–t93 порожні). Тести —
`src/utils/clubGuard.test.js`.

## Два види токенів

| Хто | Таблиця авторизації | Як входить | Що відкриває |
|---|---|---|---|
| Співробітник АФУ (Адмін, Делегат, …) | `Users` | `auth/login` (id + пароль), як і раніше | наявні ендпоінти `crm` і `Default` за правами; ендпоінти `club-accounts…` (право 22) |
| Представник клубу | `club_account` | `POST club/auth/login` (пошта + пароль) | **лише** ендпоінти `club/…`; на будь-якому наявному ендпоінті — 401 |

Токен одного виду не приймається ендпоінтами іншого — це забезпечує сам Xano (`auth = "Users"` чи
`auth = "club_account"`).

## Кабінет клубу (`auth = "club_account"`)

### `POST crm/club/auth/login` (без авторизації)

```json
{ "email": "club@example.com", "password": "…" }
```

Пошта обрізається й переводиться в нижній регістр. Відповідь: `{ authToken, account: { id, name, email } }`,
токен на 12 год. Помилки (403): «Неправильна пошта або пароль» (і для невідомої пошти, і для не того пароля),
«Акаунт клубу вимкнено. Зверніться до АФУ», «Акаунт ще не прив'язаний до клубу. Зверніться до АФУ».
Пишеться `club_account.last_login_at`. Пароль перевіряється й тоді, коли пошти немає (фіктивним хешем),
щоб час відповіді не видавав зареєстровані адреси.

**Обмеження спроб (задача 1.2б).** Після **10 невдалих паролів поспіль** — **15 хв відмови** з тим самим
текстом «Неправильна пошта або пароль» (не підказуємо, що акаунт заблоковано); поки заблоковано, відмова
навіть із правильним паролем, а спроби не рахуються. Успішний вхід скидає лічильник. Поля
`club_account.failed_logins` і `locked_until` (Backend, AFU efc47f6); лічильник пишеться до відмови, бо
транзакції немає. Для невідомої пошти нічого не пишеться.

### `GET crm/club/me`

`{ account: { id, name, email }, acted_by_users_id, clubs: [{ teaminfo_id, name, logo, parent_teaminfo_id }] }`.
`clubs` — активні прив'язки (фарм-клуб — другий рядок). `acted_by_users_id` — id Адміна, якщо це вхід «як
клуб», інакше null. Вимкнений акаунт — 403.

### `GET crm/club/clubs/{teaminfo_id}`

Картка свого клубу: `TeamName`, `TeamLogo`, `TeamPhoto`, `TeamInfo`, `founded_year`, `home_venues_id`,
`website`, `instagram`, `facebook`, `youtube`, `colors`, `kit_color_primary`, `kit_color_secondary`,
`contact_name`, `contact_phone`, `contact_email`, `parent_teaminfo_id`.

### Що варто знати про токени

- **Зміна пароля не відкликає вже видані токени**: старий токен клубу діє до кінця свого строку (до 12 год).
- **Вимкнення акаунта чи прив'язки до клубу діє з наступного запиту**: сторож і «хто я» щоразу читають
  `is_active` акаунта й прив'язки, тож вимкнений акаунт одразу отримує 403, хоч токен ще не сплив.
- `acted_by_users_id` з токена читається лише через `|get` з типовим null: при звичайному вході
  `extras` порожні, і пряме звернення до поля дає 500.

### Сторож «лише свій клуб»

Кожен клубний ендпоінт із `teaminfo_id` — до будь-якого читання даних клубу:
акаунт активний **і** є активна прив'язка `club_account_club` (`club_account_id` = токен,
`teaminfo_id` = запитаний). Інакше **403**: «Це не ваш клуб» / «Акаунт клубу вимкнено…». Текст
сторожа однаковий у всіх ендпоінтах; тест перевіряє, що він є дослівно й стоїть до читання
`TeamInfo`, `People`, `Team` тощо, а клубні ендпоінти не пишуть в основні таблиці.

### Чернетка картки клубу (задача 2.1; НЕ задеплоєно)

Усі — `auth = "club_account"`, сторож «лише свій клуб». В основні таблиці не пишуть нічого.

- `POST crm/club/clubs/{teaminfo_id}/upload` (multipart, поле `image`) → `{ image }` — об'єкт файлу у vault.
  До 5 МБ, лише зображення. Обрізку робить CRM (емблема — квадрат 1024×1024, PNG). У картку файл потрапить
  лише після погодження.
- `GET crm/club/venues` → `[{ id, City }]` — для вибору домашньої арени.
- `GET crm/club/clubs/{teaminfo_id}/draft` → `{ draft }` — відкрита заявка на картку (`open_key = club:<id>`):
  `{ id, status: draft|submitted, after, club_comment, batch_id, updated_at, created_at, acted_by_users_id }` або null.
- `PUT crm/club/clubs/{teaminfo_id}/draft` `{ after, club_comment? }` — форма цілком; сервер лишає в `after`
  лише відмінні від чинної картки поля: `TeamLogo`, `TeamPhoto` (лише з `/vault/`), `TeamInfo` (≤ 2000),
  `founded_year` (1850…поточний), `home_venues_id` (з `Venues`), `venue_suggestion` (текст для АФУ, у таблицю
  не пишеться), `website`/`instagram`/`facebook`/`youtube` (`https://…`), `kit_color_primary`/`secondary`
  (`#RRGGBB`), `contact_name`/`phone`/`email`. Порожнє поле — `null` (очистити); прибрати фото не можна. Будь-яке
  інше поле (назва, турнір, материнський клуб, «актуальний») — 400. Немає відмінностей — чернетка видаляється.
  Заявка вже на погодженні — 400 (спершу відкликати пакет, 2.2). `acted_by_users_id` — з `extras` через `|get`.
- `DELETE crm/club/clubs/{teaminfo_id}/draft` — клуб прибирає свою чернетку (лише `draft`).

### Пакет на погодження (задача 2.2; НЕ задеплоєно)

- `GET crm/club/clubs/{teaminfo_id}/pending` → `{ drafts: [{ id, entity, action, entity_id, leagues_id, people_id,
  after, updated_at }], open_batch: { id, status, submitted_at, title, club_comment, rows, decided } | null,
  next_submit_at }` — `next_submit_at` (мс) лише коли ліміт ще діє.
- `POST crm/club/clubs/{teaminfo_id}/submit` `{ title?, club_comment? }` → усі `draft` клубу стають `submitted` в
  одному `change_batch`; у кожну заявку пишеться `before` — поля основного запису (`TeamInfo` / `People` / `Team` /
  `Administration of teams`), які вона змінює, на момент подачі (для `create` — null). 400 «Немає змін для
  надсилання»; 400 «Пакет можна надсилати не частіше разу на годину» (рахуються всі пакети клубу, крім
  відкликаних).
- `POST crm/club/clubs/{teaminfo_id}/batches/{batch_id}/withdraw` — лише поки жодна заявка пакета не має рішення:
  заявки → `draft` (`batch_id`, `before` — null), пакет → `withdrawn`. Інакше 400 «По пакету вже є рішення АФУ…».
- «Одна відкрита заявка на запис» — унікальний `open_key` (контракт 1.1, п. 3); відкликання ключ не звільняє.

### Переходи статусу — CAS одним SQL (рецензія Backend 30.10; НЕ задеплоєно)

Кожна зміна `status` заявки (`change_request`, у Postgres Xano `x1_93`) чи пакета (`change_batch`, `x1_92`) —
одним оператором з умовою на очікуваний статус і `RETURNING id`; порожній результат — хтось випередив → 400
«Заявка вже змінилась — оновіть сторінку» (коду 409 у Xano немає). Решта полів (`before`, `updated_at`, коментарі)
пишеться звичайним `db.edit` лише після вдалого CAS.

| Де | SQL |
|---|---|
| PUT чернетки — нове `after` | `UPDATE x1_93 SET "after" = ?::jsonb WHERE id = ? AND status = 'draft' RETURNING id` |
| PUT без змін / DELETE чернетки | `DELETE FROM x1_93 WHERE id = ? AND status = 'draft' RETURNING id` |
| submit — кожен рядок | `UPDATE x1_93 SET status = 'submitted', batch_id = ? WHERE id = ? AND status = 'draft' AND batch_id IS NULL RETURNING id`; пакет без рядків — видаляється й відмова |
| withdraw — пакет | `UPDATE x1_92 SET status = 'withdrawn' WHERE id = ? AND teaminfo_id = ? AND status = 'submitted' AND NOT EXISTS (рядок пакета з іншим статусом) RETURNING id` |
| withdraw — рядки (після пакета) | `UPDATE x1_93 SET status = 'draft', batch_id = NULL, "before" = NULL WHERE batch_id = ? AND status = 'submitted'` |

Для 4.1/4.2: погодження/повернення — `WHERE id = ? AND status = 'submitted' AND EXISTS (пакет рядка досі
'submitted')`, інакше відкликаний пакет можна погодити. Тест (`clubGuard.test.js`): жодного `db.edit
change_request`/`change_batch` зі `status`, кожен SQL-перехід — з умовою на статус і `RETURNING id`.

Живі перевірки вранці: `UPDATE … RETURNING` через `db.direct_query` повертає id (і порожньо без збігу); `?::jsonb`
з `|json_encode`.

### Заявки клубу (задача 2.3; НЕ задеплоєно)

`GET crm/club/clubs/{teaminfo_id}/requests` → `{ batches: [{ id, status, submitted_at, withdrawn_at, closed_at, title,
club_comment, by_afu, requests: [{ id, entity, action, entity_id, leagues_id, people_id, depends_on_id,
before, after, status, decision_comment, decided_at, applied_at, person_name, league_name, transfer_from_name }] }],
transfers_out: [{ id, applied_at, person_name, to_club, league_name }] }`. Пакети — від нових; чернетки сюди не
входять. `transfers_out` — гравці, яких інший клуб забрав погодженим переходом (рішення 8.4). `apply_error` клубу
не віддається.

### Склад клубу (задача 3.1; НЕ задеплоєно)

Варіант 3 (рішення Андрія 30.10, AFU `docs/xano/club-self-service-apply.md` розділ 5): гравець у клубі — один
рядок `Team` (основний турнір і номер), додаткові турніри — `team_league` (t96). Усе нижче пише лише чернетки
`change_request`; основні таблиці й `team_league` — лише 4.2.

- `GET crm/club/clubs/{id}/squad` → `{ tournaments: [{ id, name, window_only, window_open, next_window_at }],
  positions: [{ id, name }] (лише ігрові), players: [{ team_id, people_id, name, photo, Number, positions_id,
  position, Captain, leagues_id, league_name, also: [{ id, leagues_id, league_name, Number }], request }],
  pending: [{ request_id, status, action, name, new_person, person_request_id, leagues_id, league_name, Number,
  position, transfer_from }] }`. Турніри — поточного сезону, де клуб учасник; `players` — чинні рядки `Team`, у
  яких хоч один турнір (основний чи `also`) поточного сезону; `request` — відкрита зміна цього рядка.
- `GET crm/club/clubs/{id}/people-search?q=&dob=` — лише прізвище **і** повна дата народження (інакше порожньо).
  Віддає мінімум, щоб упізнати двійника: `{ people: [{ id, prizvushche, Name, birth_year, active_clubs:
  [{ teaminfo_id, name }] }] }` — без по батькові, фото, контактів і точної дати.
- `POST crm/club/clubs/{id}/players` `{ person: {people_id} | {new: {prizvushche, Name, po_batkovi?, Date_of_birth,
  City?, Growth?, Weight?, Photo?}}, rows: [{leagues_id, Number, positions_id, Captain?}], club_comment? }` →
  `{ person_request_id, rows }`. Нова особа — `person.create` (дубль прізвище + дата → 400 «обрати наявну»);
  на кожен турнір — `squad_row.create`, або `transfer`, якщо особа чинна в чужому клубі (не материнський / фарм /
  «брат»). **Порядок `rows` — порядок вибору:** перший стає основним (`Team`), решта — `team_league`; гравцю, що
  вже в складі клубу, основний не змінюється. Перевірки: турнір свій поточного сезону, вікно відкрите, номер
  1–99 і не зайнятий (`Team` + `team_league` + відкриті заявки), позиція ігрова, особа ще не в цьому турнірі
  клубу (`Team` чи `team_league`) і без відкритої заявки на нього.
- `POST crm/club/clubs/{id}/players/{team_id}/remove` `{ leagues_id?, end_date }` → `squad_row.remove`,
  `entity_id` = `team_id`, `leagues_id` — з якого турніру (типово основний; додатковий — лише активний рядок
  `team_league` цього гравця), `after` = `{ End_date }`. Що закриється — вирішує 4.2 (`планВивестиЗТурніру`).
  Одна відкрита зміна на гравця (ключ `team:<id>`).
- `DELETE crm/club/clubs/{id}/requests/{request_id}` — прибрати свою чернетку разом із залежними
  (`depends_on_id`) одним CAS-оператором; особа-сирота (`person.create`, на яку вже ніщо не посилається) —
  теж.

**Для 4.1/4.2:** рядки однієї нової особи варто застосовувати в порядку `id` — тоді основним стане турнір, який
клуб обрав першим.

## Акаунти клубів для АФУ (`auth = "Users"`, право 22 «Акаунти клубів»)

### `GET crm/club-accounts`

`[{ id, created_at, email, name, is_active, last_login_at, created_by_users_id, clubs: [{ teaminfo_id, name }] }]`
(лише активні прив'язки). Пароля немає.

### `POST crm/club-accounts`

```json
{ "email": "club@example.com", "name": "ФК Сокіл", "password": "щонайменше 8", "teaminfo_ids": [12] }
```

Відповідь: `{ id, email, name, is_active, teaminfo_ids }`. Помилки (400): «Вкажіть правильну пошту»,
«Акаунт з такою поштою вже є», «Вкажіть назву акаунта…», «Пароль — щонайменше 8 символів», «Оберіть
клуб», «Кілька клубів в одному акаунті — лише материнський клуб і його фарм-клуб» (спільний
`parent_teaminfo_id`), «У клубу вже є акаунт. Один акаунт на клуб — змініть наявний».

### `PATCH crm/club-accounts/{club_account_id}`

Будь-яке з: `name`, `is_active`, `password` (новий; щонайменше 8), `teaminfo_ids` (повний новий набір).
Змінюється лише надіслане. Прибрані клуби — прив'язка вимикається (не видаляється: заявки посилаються на
акаунт), повернуті — вмикається знову, нові — додаються. Ті самі перевірки, що в POST. Відповідь:
`{ id, email, name, is_active, last_login_at }`.

### `POST crm/club-accounts/{club_account_id}/impersonate` — «увійти як клуб»

Відповідь `{ authToken, expires_in: 3600, account: { id, name } }` — токен `club_account` на 1 год з
`extras.acted_by_users_id` = Адмін. CRM відкриває з ним кабінет клубу; заявки записують і акаунт клубу,
і Адміна. Вимкнений чи не прив'язаний акаунт — 400.

## Перевірка після розгортання

1. Тестовий акаунт прив'язати до клубу, що не показується в застосунку; пароль вводить Андрій.
2. `club/auth/login` → токен клубу; `club/me` і `club/clubs/{свій}` — 200; `club/clubs/{чужий}` — 403.
3. Токен клубу на кількох наявних ендпоінтах (`crm`: `clubs`, `people/search`, `matches`, `delegates`;
   `Default`: запис матчу й таблиці з відкритого переліку Backend) — 401. Токен співробітника на
   `club/me` — 401.
4. «Увійти як клуб» — `club/me` показує `acted_by_users_id`.
5. Тестовий акаунт і його прив'язки — прибрати.

## Екрани CRM (задача 1.3)

- **Вхід клубу — `/club/login`**, окремо від входу АФУ (`/login`); між ними — посилання. Після входу — `/club`.
- **Кабінет клубу (`/club`)**: лише свій клуб, жодного розділу АФУ; фарм-клуб — перемикач клубу вгорі
  (вибір пам'ятається до виходу). «Мій клуб» поки показує картку (`GET club/clubs/{id}`); редагування й заявки —
  етап 2.
- **Режим і маршрути** — `src/auth/clubSession.js` (тести поруч):
  - чинна сесія клубу важить більше за вхід АФУ: представник і Адмін «як клуб» на будь-якій іншій адресі
    (зокрема `/users`, `/settings`, `/login`) опиняються в `/club`;
  - співробітник з адреси кабінету — на «Користувачі → Акаунти клубів» (`/users?tab=clubs`);
  - без входу — лише `/login` і `/club/login`.
- **Токени окремо**: АФУ — `afu-crm-token`, клуб — `afu-crm-club-session` (`token`, `expires_at`, `as_admin`,
  `account`). 401 клубного запиту закриває лише кабінет клубу; вхід АФУ лишається. Кеш запитів чиститься на
  кожному вході й виході з кабінету.
- **«Увійти як клуб»** (Акаунти клубів): помітна смуга «Ви в кабінеті клубу X як Адмін · ще N хв · Вийти з
  кабінету». Вихід — назад на «Акаунти клубів»; через годину — так само, з поясненням «Час входу як клуб минув
  (1 год) — ви знову в CRM АФУ».
- **«Користувачі → Акаунти клубів»** (право 22 — на сервері): список; новий акаунт (пошта, назва, пароль
  звичайним полем, клуби з пошуком, архівні позначено); зміна (назва, стан, новий пароль — порожньо не
  змінює, набір клубів). Надсилається лише змінене (`src/utils/clubAccounts.js`). Пароль очищується з форми
  одразу після відправлення й ніде не показується. Помилки — тексти сервера.
