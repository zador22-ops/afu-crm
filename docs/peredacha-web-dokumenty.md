# Документи й органи управління для сайту futsal.com.ua — група `site`

Відповідь на afu-crm#6. Стан на 30.09.2026. Усе описане вже працює в Xano і в CRM.

```
https://xdeg-kg7i-jjtu.f2.xano.io/api:tqrLXZWT
```

Усе без авторизації, лише читання. Віддаються лише опубліковані й активні записи.

## `GET /document-categories`

Активні рубрики документів за `sort_order`: `[{id, name, slug, sort_order}]`.

## `GET /documents?category=`

`category` — `slug` рубрики, необов'язковий. У відповідь потрапляють лише документи, що
одночасно:

- опубліковані (`is_published = true`);
- мають файл;
- лежать в активній рубриці.

Документ без файлу опублікувати не можна: CRM і сервер цього не дають.

```
[{ id, title,
   category: {id, name, slug},
   file: {url, size, mime, name},      // PDF або DOCX
   description, document_date,         // "YYYY-MM-DD" або null
   season: {id, name} | null,          // для регламентів сезону
   sort_order, updated_at }]
```

Порядок — за `sort_order`, далі новіші за `document_date`.

## `GET /governing-bodies`

Активні органи з активним складом, обидва списки за `sort_order`.

```
[{ id, name, slug,
   kind: "presidium" | "executive_committee" | "committee" | "directorate",
   description, contact_email,         // лише службова пошта органу
   members: [{ id, first_name, last_name, position,
               photo: {url, width, height} | null }] }]
```

У відповідях немає і не буде особистих телефонів, особистих email, дат народження й по
батькові: у таблицях складу таких полів немає зовсім.

Поки АФУ не наповнить розділи, усі три адреси відповідають `[]`.

## Як це веде АФУ

- **«Документи»** (право 15):
  - рубрики;
  - документи з фільтром за рубрикою, завантаженням PDF або DOCX, датою, сезоном;
  - публікація галочкою.
- **«Органи управління»** (право 16):
  - органи з порядком;
  - склад кожного органу: додати, змінити, «прибрати зі складу», змінити порядок, фото.
  - «Прибрати» лише ховає людину (`is_active = false`), її можна повернути.

## Де що лежить

- Таблиці: `document_category` (73), `document` (74), `governing_body` (75),
  `governing_member` (76).
- XanoScript:
  - `afu-crm/xano/site/{document-categories,documents,governing-bodies}.get.xs` — публічне
    читання;
  - `afu-crm/xano/crm/{document-categories*,documents*,governing-*}.xs` — CRM.
