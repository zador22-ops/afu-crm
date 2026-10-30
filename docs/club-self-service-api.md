# Самообслуговування клубів — ендпоінти CRM

Від CRM (команда 2). ТЗ — `docs/briefs/crm-samoobslugovuvannya-klubiv-2026-10-25.md`; модель даних —
контракт Backend `docs/xano/club-self-service-model.md` у репо AFU (задача 1.1). Логіка —
`xano/crm/club-*.xs`. Група `crm` (`api:6HPZ3cxp`).

**Задача 1.2 і 1.2б.** Розгорнуто 26.10.2026 (за «так» Андрія; знімок списку crm до розгортання —
`xano/backups/crm-endpoints.2026-10-26.json`), перевірено наживо 29.10.2026 на тимчасовому акаунті клубу
#58 (пароль вводив Андрій; акаунт і прив'язку прибрано, t90–t93 порожні). Тести —
`src/utils/clubGuard.test.js`.

## Розгортання ночі 30.10 — що й у якому порядку (для Андрія; усе лише з «так»)

Стан на 30.10.2026 (ніч): усе нижче прийнято PM 2 (38abf26 — після «гаразд» Backend), рецензовано Backend, **не розгорнуто й не запушено**. Таблиці
(t90–t96, `change_batch.has_decision`), права 21 / 22 і `Variables` 10 уже на живому Xano — нового в базі не
потрібно.

**Кроки 1–3 розгорнуто 30.10.2026** (за «так» Андрія): створено 18 + 1 + 4 = 23 (id 797–819), оновлено 0; список crm —
179, жоден наявний не зник і не змінився; анонімно нові ендпоінти дають 401. Знімок до —
`xano/backups/crm-endpoints.2026-10-30.json`. `--check` після створення показує «оновлено» — переформатування Xano,
не розбіжність. Крок 4 (`moderation-`) — ні, чекає живих перевірок А–В. Фронт не запушено.

**Сервер — лише нові ендпоінти, 28 штук; жоден наявний не змінюється.** Розгортати **тільки з фільтром**:
`node xano/deploy.mjs` без фільтра показує ще 110 «змінених» наявних ендпоінтів — це переформатування Xano
(однорядкові об'єкти, коментарі над `query`), а не правки, але переписувати їх нема причини. Перед кожним
кроком — `--check` (має бути «створено N, оновлено 0») і знімок списку crm у `xano/backups/`.

| Крок | Фільтр | Створює | Що це |
|---|---|---|---|
| 1 | `club-clubs-id-` | 18 | кабінет клубу: чернетка картки й фото (2.1), пакет / відкликання (2.2), заявки (2.3), склад (3.1, 3.1б), штаб (3.3) |
| 2 | `club-venues` | 1 | список арен для картки (2.1) |
| 3 | `registration-` | 4 | «Службове → Заявкові періоди» (3.4, право 21) |
| 4 | `moderation-` | 5 | «Погодження» (4.1) і застосування (4.2, право 21) — **лише разом**: екран 4.1 кличе approve з 4.2 |

**Порядок і перевірки** (узгоджено з Backend). 1–3 разом (кабінет клубу й періоди пишуть лише в t92–t95) →
ранкові живі перевірки А–В на тестовому клубі (план Backend `docs/xano/club-self-service-live-checks.md`, 4а —
першою) → лише тоді 4 (погодження пише в основні таблиці) → живі перевірки 4.2 (пункт Г: `db.add` /
`db.patch` з динамічним `data`, HEAD на файл, `direct_query` без `arg`, template literals у правилах, збій →
`failed` «Зроблено: …») на прихованому турнірі тестового клубу. Лише потім — фронт.

**Фронт — один push `main`** (`git log origin/main..HEAD` — лише коміти клубів 1.3–4.2 від b032260; чужих
немає; перед push звірити, що всі прийняті PM 2 — 38abf26 і цей опис на прийнятті). Пушити **після всіх чотирьох кроків сервера**: у фронті вже є вкладки «Склад», «Штаб»,
«Погодження» й «Заявкові періоди» — до сервера вони давали б 404. Без права 21 / 22 нові пункти меню не видно.

**Відкат** — лише з окремого слова Андрія. Сервер — вимкнути / видалити створені 28 ендпоінтів за знімком (наявні не змінювались). Фронт —
`git revert` і push. Дані: записи йдуть лише в t92–t96 і (після «Погодити») в основні таблиці — тому 4.2
вмикати останнім і перевіряти на тестовому клубі.

### CAS v2 — після живої перевірки А2 (31.10; 7 файлів кроку 1 розгорнуто 31.10)

**Розгорнуто 31.10 за «так» Андрія** (після схеми Backend: t101 `change_lock`, `rev`, default null): 7 файлів
точними фільтрами — оновлено #797, #798, #800, #804, #806, #810, #813, помилок 0; список crm не змінився (179); без
входу — 401. Копії живих текстів до заміни — `xano/backups/*.2026-10-31.before-cas-v2.xs`, знімок списку —
`xano/backups/crm-endpoints.2026-10-31-cas-v2.json`. Крок 4 — ні.

А2 показала, що записи через SQL у Xano неможливі (`0A000`), — переходи переписано на таблицю-замок (розділ «Переходи
статусу — CAS v2» нижче). Розгортання — одним «так» Андрія разом зі схемою Backend (`rev`, `change_lock`, default 0 →
null), після живих перевірок механізму Ж1–Ж5:

- оновлюються **7 уже розгорнутих** файлів кроку 1 — кожен своїм точним фільтром (`--check` для `club-clubs-id-`
  покаже «оновлено 18»: це переформатування Xano, а не зміни; решту 11 не чіпаємо): `club-clubs-id-draft.put`,
  `club-clubs-id-draft.delete`, `club-clubs-id-submit`, `club-clubs-id-batches`, `club-clubs-id-requests-id`,
  `club-clubs-id-players-id.put`, `club-clubs-id-staff-id.put`;
- крок 4 (`moderation-`) — уже в новому вигляді;
- якщо Ж1–Ж2 не пройдуть — запасний варіант 3.3 (прибрати позначену обгортку транзакції) лише для **кроків 1–3**;
- **без працюючої `db.transaction` крок 4 (`moderation-`) НЕ розгортається** — 4.2 тоді переробляємо окремо: запасний
  шлях для approve небезпечний (збій посередині лишить напівзапис у `Team` / `People`), PM 2 31.10.

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

### Переходи статусу — CAS v2: таблиця-замок (31.10; замінює «CAS одним SQL»)

Жива перевірка А2 (30.10): `UPDATE x1_93 … RETURNING` через `db.direct_query` → `0A000 FEATURE NOT SUPPORTED`
(`x1_<id>` у Xano — view). Рішення PM 2: **жодних записів через SQL**. Контракт — AFU
`docs/xano/club-self-service-cas-v2.md`. Схема: `change_request.rev`, `change_batch.rev`, таблиця `change_lock`
(`key` унікальний).

Кожен перехід: прочитати рядок (і `rev`) → `precondition` очікуваного статусу → у `try_catch { db.transaction {
… } }`: `db.add change_lock` на кожен ключ → записи → `rev + 1`. Не вдалось → **поза транзакцією** `db.get
change_lock` за ключами: є → 400 «Заявка вже змінилась — оновіть сторінку», немає → помилка бази. Текст помилки Xano
не читається. Кілька рядків — замки за зростанням `id`.

| Перехід | Ключі |
|---|---|
| Чернетка: змінити `after` / видалити (draft PUT / DELETE, players / staff PUT) | `cr:<id>:<rev>` |
| Видалити з залежними й осиротілою новою особою (requests DELETE) | `cr:` кожного рядка |
| submit — новий пакет і всі рядки в одній транзакції (порожнього пакета не буває) | `cr:` кожної чернетки |
| withdraw — доля пакета спершу читається (є → відмова) | `batch:<id>:fate` (`withdrawn`) + `cr:` кожного рядка |
| Повернути / Погодити — доля читається: `withdrawn` → відмова, `decided` → далі без нового ключа | `batch:<id>:fate` (`decided`, якщо ще немає) + `cr:` рядка (+ `cr:` нової особи, чий статус стає остаточним) |
| Погодити нову особу | + `person:<cr_id>` (створює рівно один модератор) |

**Запасний варіант 3.3** (якщо `db.transaction` не пройде живу перевірку Ж1–Ж2): прибрати рядки між
позначками `// ТРАНЗАКЦІЯ ↓` і `// ТРАНЗАКЦІЯ ↑` у кожному файлі; прибирання своїх замків у `catch` уже є —
**за `id` свого рядка `change_lock`, не за `key`** (інакше можна стерти чужий замок, вставлений після відкату; рецензія
Backend, контракт 3.3, AFU 4a83d09). Конфлікт лише на долі пакета (паралельне перше рішення по іншому рядку) —
«спробуйте ще раз». `change_batch.rev` — лише відображення, ніде не ключ.
Тести — `src/utils/clubCas.test.js`.

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
  `team_league` цього гравця), `after` = `{ End_date }` (не в майбутньому й не раніше `Team.Date`). Що закриється — вирішує 4.2 (`планВивестиЗТурніру`).
  Одна відкрита зміна на гравця (ключ `team:<id>`).
- `DELETE crm/club/clubs/{id}/requests/{request_id}` — прибрати свою чернетку разом із залежними
  (`depends_on_id`) однією транзакцією CAS v2; особа-сирота (`person.create`, на яку вже ніщо не посилається) —
  теж.

- `PUT crm/club/clubs/{id}/players/{team_id}` (3.1б) `{ person?: {prizvushche, Name, po_batkovi, Date_of_birth, City,
  Growth, Weight, Photo}, squad?: {leagues_id, Number, positions_id?, Captain?}, club_comment? }` → `{ person_after,
  squad_after }`. Форма цілком; сервер лишає в `after` лише змінене. Дві чернетки: `person.update` (ключ
  `person:<people_id>`) і `squad_row.update` (ключ `team:<team_id>`, `leagues_id` — турнір): основний — номер,
  позиція, капітан; додатковий (`team_league`) — лише номер. **Лише свої особи:** особа береться тільки з чинного
  рядка `Team` цього клубу (інакше 403 «Це не ваш гравець»), `People` читається після цієї перевірки. Нова особа
  із заявки так не змінюється — прибрати й додати знову. Порожня зміна прибирає свою чернетку; чужу відкриту
  зміну складу (виведення чи інший турнір) не чіпає — тоді зміна складу → 400 «за раз — один турнір». Зміну
  даних на погодженні — 400. `squad.get` віддає гравцю ще `prizvushche`, `Name`, `po_batkovi` і `person_request`.

**Для 4.1/4.2:** рядки однієї нової особи варто застосовувати в порядку `id` — тоді основним стане турнір, який
клуб обрав першим.

### Штаб клубу (задача 3.3; НЕ задеплоєно)

Лише чернетки `change_request`; `Administration of teams` — лише 4.2. Заявкових вікон для штабу немає.

- `GET crm/club/clubs/{id}/staff` → `{ positions: [{ id, name }] (лише посади штабу), staff: [{ id, people_id, name,
  prizvushche, Name, po_batkovi, Date_of_birth, City, Growth, Weight, photo, positions_id, position, Date, request,
  person_request }], pending: [{ request_id, status, name, new_person, positions_id, position }] }`. `staff` — чинні
  рядки клубу.
- `POST crm/club/clubs/{id}/staff` `{ person: {people_id} | {new: {…як у складі}}, positions_id, club_comment? }` →
  `{ request_id, person_request_id }`. Нова особа — `person.create` (дубль → 400). `staff_row.create`, `after` =
  `{ positions_id }`, ключ `staffnew:<клуб>:<особа | new<id>>:<посада>`. Посада — не ігрова; та сама особа на тій
  самій посаді клубу чи з такою відкритою заявкою — 400. Пошук особи — той самий `people-search`.
- `PUT crm/club/clubs/{id}/staff/{staff_id}` `{ person?, positions_id?, club_comment? }` → `person.update` (ключ
  `person:<people_id>`, як у складі) і `staff_row.update` (ключ `staff:<id>`, `after` = `{ positions_id }`). **Лише
  свої особи:** особа — тільки з чинного рядка штабу цього клубу (інакше 403), `People` — після перевірки.
- `POST crm/club/clubs/{id}/staff/{staff_id}/remove` `{ end_date }` → `staff_row.remove`, `after` = `{ end_date }`
  (не в майбутньому й не раніше `Date`), ключ `staff:<id>`.
- Прибрати чернетку — той самий `DELETE crm/club/clubs/{id}/requests/{request_id}`.

## Заявкові періоди для АФУ (задача 3.4; `auth = "Users"`, право 21; НЕ задеплоєно)

Таблиці t94 `registration_window`, t95 `registration_rule` (контракт 1.1, розділ 2.5). Час — epoch мс; CRM
переводить із київського.

- `GET crm/registration-windows?all=` → `[{ id, name, season_id, window_only, windows: [{ id, starts_at, ends_at,
  note }], open_now, next_window_at }]` — турніри поточного сезону (з `all` — усі). `open_now` і `next_window_at` —
  те саме правило, що в `club/clubs/{id}/squad`.
- `POST crm/registration-windows` `{ leagues_id, starts_at, ends_at, note? }`;
  `PATCH crm/registration-windows/{id}` `{ starts_at, ends_at, note? }` — кінець пізніше початку, періоди одного
  турніру не перетинаються, примітка ≤ 200.
- `PUT crm/registration-rules/{leagues_id}` `{ window_only }` — один рядок на турнір: немає — створюється.
- Екран — «Службове → Заявкові періоди», лише з правом 21. Видаляти періоди не можна — лише змінити.

## «Погодження» для АФУ (задача 4.1; `auth = "Users"`, право 21; НЕ задеплоєно)

- `GET crm/moderation/count` → `{ batches, rows }` — пакети з рядком `submitted` (лічильник у меню).
- `GET crm/moderation/batches?state=open|done|withdrawn|all&teaminfo_id=&entity=` → `[{ id, teaminfo_id, club_name,
  acted_by_name, title, club_comment, status, state, submitted_at, closed_at, withdrawn_at, rows, counts: {submitted,
  approved, applied, rejected, failed}, entities }]`. Стан — за рядками (контракт 4.2, розділ 0): `open` — є
  `submitted`; `done` — рішення по всіх; `withdrawn` — відкликаний без рішень. Ті, що чекають, — від найстаріших.
- `GET crm/moderation/batches/{id}` → `{ batch, rows: [{ …заявка, person_name, person_photo, new_person, league_name,
  transfer_from_name, decision_name, decidable, window_open, target: 'Team'|'team_league'|null, primary_change:
  {leagues_id, league_name, Number}|null }], labels: { positions, venues } }`. Нічого не пише. `decidable` — `submitted`
  і не `person.create` (його рішення виводиться з рядків). `target` — куди піде рядок складу (варіант 3: перший рядок
  нової особи — `Team`, решта й рядки особи, що вже в складі клубу, — `team_league`). `primary_change` — виведення з
  основного турніру, коли є активні додаткові: основним стане найраніший (як `планВивестиЗТурніру`).
- `POST crm/moderation/requests/{id}/reject` `{ comment }` (3–1000) → `rejected` однією транзакцією CAS v2: доля пакета
  (`batch:<id>:fate`, якщо ще немає), `cr:` рядка; там само — наслідки, пораховані наперед: нова особа, чиї рядки
  остаточні й жоден не застосовано, — `rejected` / `failed`; пакет без `submitted` / `approved` — `closed`;
  `has_decision` = true (лише відображення). `open_key` = null. Нічого в основні таблиці.
- «Погодити» (`POST crm/moderation/requests/{id}/approve`) — застосування, задача 4.2. «Погодити все в пакеті» —
  CRM по черзі за `id` кличе той самий «Погодити» (кожен рядок — свій CAS і своє застосування).
- Екран — пункт меню «Погодження» з числом пакетів (лише з правом 21); список із фільтрами клуб / тип; пакет —
  картки рядків «було / стане» двома колонками, фото поруч, перехід, зміна основного турніру, закрите вікно.

## Застосування погодженого (задача 4.2; `auth = "Users"`, право 21; НЕ задеплоєно)

`POST crm/moderation/requests/{id}/approve` → `{ id, status: 'applied'|'failed', apply_error, applied_entity_id }`.
Переходи — CAS v2, проміжного `approved` немає:

1. Доля пакета `batch:<id>:fate` — спершу читається: `withdrawn` → 400 «Клуб відкликав цей пакет».
2. Читання; перевірка файлів фото (HEAD → 200) і план — у `try_catch`, **до** транзакції. План — правила 4.2
   **дослівно** з AFU `apply-rules.js` (між мітками; тест звіряє побайтово) + склейка CRM → кроки запису.
3. План пройшов → **одна транзакція** `submitted` → `applied`: ключі (доля, `person:<cr_id>` і `cr:` нової особи,
   `cr:` рядка, `cr:` нових осіб, чий статус стає остаточним), `db.add People` + її заявка `applied`, кроки в основні
   таблиці (перехід: спершу новий `Team`, потім закриття старого й його `team_league`), рядок `applied`, наслідки
   (нова особа, закриття пакета). Збій — відкочено **все**.
4. Транзакція не пройшла: `person:` зайнятий, а свій `cr:` ні → 400 «Нову особу саме створює інший модератор —
   спробуйте ще раз»; інший ключ → 400 «Заявка вже змінилась»; ключі вільні (впав запис) → крок 5 з «Помилка запису в
   Xano під час застосування — нічого не змінено».
5. План не пройшов (чи крок 4) → окрема транзакція `submitted` → `failed` з текстом. Нова особа не пройшла правила
   (двійник тощо) → її заявка й інші її рядки, що чекають, — теж `failed`.
6. Два одночасні рішення в одному пакеті, які не бачать одне одного, доводить до кінця `GET moderation/batches`:
   остаточний статус нової особи (свій замок і транзакція; зайнято — пропуск) і закриття пакета за фактичним станом.

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
