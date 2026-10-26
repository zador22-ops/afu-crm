# Самообслуговування клубів — ендпоінти CRM

Від CRM (команда 2). ТЗ — `docs/briefs/crm-samoobslugovuvannya-klubiv-2026-10-25.md`; модель даних —
контракт Backend `docs/xano/club-self-service-model.md` у репо AFU (задача 1.1). Логіка —
`xano/crm/club-*.xs`. Група `crm` (`api:6HPZ3cxp`).

**Задача 1.2.** Стан: написано, тести є (`src/utils/clubGuard.test.js`), **на сервер не розгорнуто**.

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
Пишеться `club_account.last_login_at`.

### `GET crm/club/me`

`{ account: { id, name, email }, acted_by_users_id, clubs: [{ teaminfo_id, name, logo, parent_teaminfo_id }] }`.
`clubs` — активні прив'язки (фарм-клуб — другий рядок). `acted_by_users_id` — id Адміна, якщо це вхід «як
клуб», інакше null. Вимкнений акаунт — 403.

### `GET crm/club/clubs/{teaminfo_id}`

Картка свого клубу: `TeamName`, `TeamLogo`, `TeamPhoto`, `TeamInfo`, `founded_year`, `home_venues_id`,
`website`, `instagram`, `facebook`, `youtube`, `colors`, `kit_color_primary`, `kit_color_secondary`,
`contact_name`, `contact_phone`, `contact_email`, `parent_teaminfo_id`.

### Сторож «лише свій клуб»

Кожен клубний ендпоінт із `teaminfo_id` — до будь-якого читання даних клубу:
акаунт активний **і** є активна прив'язка `club_account_club` (`club_account_id` = токен,
`teaminfo_id` = запитаний). Інакше **403**: «Це не ваш клуб» / «Акаунт клубу вимкнено…». Текст
сторожа однаковий у всіх ендпоінтах; тест перевіряє, що він є дослівно й стоїть до читання
`TeamInfo`, `People`, `Team` тощо, а клубні ендпоінти не пишуть в основні таблиці.

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
