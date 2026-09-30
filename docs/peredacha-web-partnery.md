# Партнери для сайту futsal.com.ua — група `site`

Відповідь на afu-crm#5. Стан на 30.09.2026. Усе описане вже працює в Xano і в CRM.

```
https://xdeg-kg7i-jjtu.f2.xano.io/api:tqrLXZWT
```

## `GET /partners`

Відповідь містить лише активних партнерів (`is_active = true`) у порядку `sort_order`. Без
авторизації, лише читання.

```json
[
  { "id": 1, "name": "…", "logo": { "url": "https://…", "width": 400, "height": 120 },
    "url": "https://…", "category": "генеральний" }
]
```

| Поле | Тип | Примітка |
|---|---|---|
| `id` | int | |
| `name` | text | назва; використовуйте як `alt` і підказку |
| `logo` | `{url, width, height}` або `null` | завантажується як є, без кадрування; бажано PNG з прозорим тлом |
| `url` | text або `null` | лише `https://`: CRM і сервер іншого не приймають |
| `category` | text або `null` | вільний текст: «генеральний», «офіційний», «медіа» |

Поки АФУ не додасть першого партнера, відповідь — `[]`.

## Як це веде АФУ

Сторінка CRM «Партнери», право «Редагування партнерів» (id 14) у ролі «Адмін». На ній:

- додати партнера й змінити його;
- змінити порядок стрілками;
- сховати галочкою «На сайті».

## Де що лежить

- Таблиця `partner`, id 72: `name`, `logo`, `url`, `category`, `is_active`, `sort_order`,
  `created_at`, `updated_at`.
- XanoScript:
  - `afu-crm/xano/site/partners.get.xs` — публічне читання;
  - `afu-crm/xano/crm/partners*.xs` — CRM: список, створення, правка, логотип, порядок.
  - Копія site-ендпоінта: `afu-futzal/docs/xano/drafts/site-partners.get.xs`.
