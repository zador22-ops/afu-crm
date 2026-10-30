query "moderation/requests/{request_id}/approve" verb=POST {
  api_group = "crm"
  auth = "Users"

  // «Погодити» заявку клубу й одразу застосувати в основну базу (самообслуговування
  // клубів, 4.2; контракт docs/xano/club-self-service-apply.md). Право 21.
  // 1. CAS submitted → approved через рядок пакета (has_decision), як «Повернути».
  // 2. Читання потрібних рядків, перевірка, що файли фото існують у vault.
  // 3. План — правила 4.2 ДОСЛІВНО з AFU docs/xano/drafts/club-self-service/
  //    apply-rules.js (тест звіряє побайтово) + склейка CRM. Жодного запису.
  // 4. План не пройшов → failed з текстом правила. Пройшов → записи в порядку
  //    плану (нова особа першою; при переході — спершу новий рядок, потім
  //    закриття старого) → applied. Транзакцій у Xano немає: якщо запис упав —
  //    failed з переліком уже зробленого, АФУ виправляє вручну.
  // 5. open_key → null завжди; нова особа без застосованих рядків — остаточний
  //    статус; пакет без submitted / approved — closed.
  input {
    int request_id filters=min:1
  }

  stack {
    function.run "Check access rights" {
      input = {id_access_rights: 21, user_id: $auth.id}
    } as $ok
    precondition ($ok) {
      error_type = "accessdenied"
      error = "Доступ заборонено"
    }

    db.get change_request {
      field_name = "id"
      field_value = $input.request_id
    } as $row
    api.lambda {
      code = """
        const r = $var.row;
        return {
          found: !!r && r.batch_id != null,
          // person.create окремо не вирішується — застосовується з першим погодженим рядком
          decidable: !!r && !(r.entity === 'person' && r.action === 'create'),
        };
      """
      timeout = 5
    } as $check
    precondition ($check.found) {
      error_type = "notfound"
      error = "Заявку не знайдено"
    }
    precondition ($check.decidable) {
      error_type = "badrequest"
      error = "Нову особу окремо не погоджують — погодьте її рядок складу чи штабу"
    }

    // 1. CAS: рядок пакета (has_decision = true) і сама заявка — одним
    // оператором. x1_92 — change_batch, x1_93 — change_request.
    db.direct_query {
      sql = """
        WITH b AS (
          UPDATE x1_92 SET has_decision = true
          WHERE id = ? AND status = 'submitted'
          RETURNING id
        )
        UPDATE x1_93 SET status = 'approved'
        WHERE id = ? AND status = 'submitted' AND batch_id IN (SELECT id FROM b)
        RETURNING id;
        """
      response_type = "list"
      arg = $row.batch_id
      arg = $input.request_id
    } as $taken
    precondition (($taken|count) > 0) {
      error_type = "badrequest"
      error = "Заявка вже змінилась — оновіть сторінку"
    }
    db.edit change_request {
      field_name = "id"
      field_value = $input.request_id
      data = {updated_at: "now", decided_at: "now", decision_users_id: $auth.id}
    } as $decided

    // 2. Читання (нічого не пише)
    db.query TeamInfo {
      return = {type: "list"}
      output = ["id", "TeamName", "parent_teaminfo_id", "team_kind"]
    } as $clubs
    db.query People {
      return = {type: "list"}
      output = ["id", "prizvushche", "Name", "Date_of_birth"]
    } as $people
    db.query Team {
      return = {type: "list"}
      output = ["id", "player_id", "teaminfo_id", "leagues_id", "Number", "positions_id", "Captain", "Date", "End_date", "Relevance_of_the_record"]
    } as $cards
    db.query team_league {
      return = {type: "list"}
      output = ["id", "team_id", "people_id", "teaminfo_id", "leagues_id", "Number", "Date", "End_date", "is_active"]
    } as $extra
    db.query "Administration of teams" {
      where = $db.Administration_of_teams.teaminfo_id == $row.teaminfo_id
      return = {type: "list"}
      output = ["id", "people_id", "teaminfo_id", "positions_id", "leagues_id", "Date", "end_date", "Relevance_of_the_record"]
    } as $staff
    db.query Positions {
      return = {type: "list"}
      output = ["id", "Position", "Player_position"]
    } as $positions
    db.query registration_window {
      return = {type: "list"}
      output = ["leagues_id", "starts_at", "ends_at"]
    } as $windows
    db.query registration_rule {
      return = {type: "list"}
      output = ["leagues_id", "window_only"]
    } as $rules
    // Нова особа, від якої залежить рядок: захопити її CAS-ом submitted → approved
    // ДО плану й db.add People (рецензія Backend 4.2, п. 1) — інакше два модератори,
    // що одночасно погоджують два рядки однієї нової особи, створили б дві People.
    var $claimed {
      value = false
    }
    conditional {
      if ($row.depends_on_id != null) {
        db.direct_query {
          sql = """
            UPDATE x1_93 SET status = 'approved' WHERE id = ? AND status = 'submitted' RETURNING id;
            """
          response_type = "list"
          arg = $row.depends_on_id
        } as $claim
        var.update $claimed {
          value = ($claim|count) > 0
        }
      }
    }
    // (id = null → порожньо); читаємо ПІСЛЯ захоплення
    db.query change_request {
      where = $db.change_request.id == $row.depends_on_id
      return = {type: "list"}
      output = ["id", "entity", "action", "teaminfo_id", "after", "status", "applied_entity_id"]
    } as $parent_list
    // Особу саме створює інший модератор (approved, але не нами) — повернути рядок
    // у submitted (записів ще не було) і попросити спробувати ще раз
    api.lambda {
      code = """
        const б = ($var.parent_list || [])[0];
        return !!б && б.status === 'approved' && !$var.claimed;
      """
      timeout = 5
    } as $person_busy
    conditional {
      if ($person_busy) {
        db.direct_query {
          sql = """
            UPDATE x1_93 SET status = 'submitted' WHERE id = ? AND status = 'approved' RETURNING id;
            """
          response_type = "list"
          arg = $input.request_id
        } as $released_row
        db.edit change_request {
          field_name = "id"
          field_value = $input.request_id
          data = {updated_at: "now", decided_at: null, decision_users_id: null}
        } as $undecided
      }
    }
    precondition ($person_busy == false) {
      error_type = "badrequest"
      error = "Нову особу саме створює інший модератор — спробуйте ще раз за хвилину"
    }

    // 2–3. Перевірка фото й план — у try_catch (рецензія Backend 4.2, п. 2): збій
    // HEAD чи лямбди плану не має лишити заявку назавжди в approved
    var $plan {
      value = null
    }
    try_catch {
      try {
        // Файли фото з after (і нової особи) мають існувати у vault: HEAD → 200
        api.lambda {
          code = """
            const шляхи = [];
            const з = (o) => {
              for (const k of ['Photo', 'TeamLogo', 'TeamPhoto']) {
                const v = o && o[k];
                const p = v && typeof v === 'object' ? String(v.path || '') : '';
                if (p) шляхи.push(p);
              }
            };
            з($var.row.after);
            const батько = ($var.parent_list || [])[0];
            if (батько && (батько.status === 'submitted' || батько.status === 'approved')) з(батько.after);
            return [...new Set(шляхи)].map((p) => ({ path: p, url: 'https://xdeg-kg7i-jjtu.f2.xano.io' + p }));
          """
          timeout = 5
        } as $image_paths
        var $images {
          value = []
        }
        foreach ($image_paths) {
          each as $img {
            api.request {
              url = $img.url
              method = "HEAD"
              timeout = 10
            } as $head
            api.lambda {
              code = """
                return { path: $var.img.path, status: $var.head && $var.head.response ? $var.head.response.status : null };
              """
              timeout = 5
            } as $checked
            var.update $images {
              value = $images|push:$checked
            }
          }
        }

        // 3. План: правила 4.2 дослівно + склейка CRM
        api.lambda {
          code = """
            // ПРАВИЛА 4.2 — ДОСЛІВНО з AFU docs/xano/drafts/club-self-service/apply-rules.js (без module.exports)
/**
 * Самообслуговування клубів, 4.2: правила застосування погодженої заявки — чисті функції.
 * Контракт docs/xano/club-self-service-apply.md. 30.10.2026.
 *
 * Без мережі й бази: на вхід — заявка й уже прочитані рядки, на вихід — план запису або текст
 * `failed`. Той самий текст CRM може вставити в api.lambda (як розбір посилань арен): рядок
 * module.exports унизу вирізається. Тести — apply-rules.test.mjs.
 *
 * Дати — рядки 'YYYY-MM-DD' (як поля date у Xano); «сьогодні» передається ззовні (Київ).
 */

// Поля, які клуб може змінювати (ТЗ 2.1, 2.2, 2.3). Решту з `after` ігноруємо.
// Як у CRM 2.1 (club/clubs/{id}/draft): кольори — kit_color_*; старе текстове `colors` клуб не змінює.
const ПОЛЯ_КЛУБУ = ['TeamLogo', 'TeamPhoto', 'TeamInfo', 'founded_year', 'home_venues_id', 'website', 'instagram', 'facebook', 'youtube', 'kit_color_primary', 'kit_color_secondary', 'contact_name', 'contact_phone', 'contact_email'];
const ПОЛЯ_ОСОБИ = ['prizvushche', 'Name', 'po_batkovi', 'Date_of_birth', 'Photo', 'City', 'Growth', 'Weight'];
const ПОЛЯ_СКЛАДУ = ['Number', 'positions_id', 'Captain'];
const ПОЛЯ_ШТАБУ = ['positions_id'];

const є = v => v !== null && v !== undefined && v !== '';
const вибрати = (об, поля) => Object.fromEntries(поля.filter(п => об && Object.prototype.hasOwnProperty.call(об, п)).map(п => [п, об[п]]));
const невдача = текст => ({ ok: false, failed: текст });

/** target_key заявки (контракт 1.1, розділ 3). */
function ключЗаявки(з) {
  const { entity, action } = з;
  if (entity === 'club') return `club:${з.teaminfo_id}`;
  if (entity === 'person' && action === 'create') return `newperson:${з.id}`;
  if (entity === 'person') return `person:${з.entity_id}`;
  if (entity === 'squad_row' && (action === 'create' || action === 'transfer')) return `squad:${з.teaminfo_id}:${з.leagues_id}:${з.people_id ?? `new${з.depends_on_id}`}`;
  if (entity === 'squad_row') return `team:${з.entity_id}`;
  if (entity === 'staff_row' && action === 'create') return `staffnew:${з.teaminfo_id}:${з.people_id ?? `new${з.depends_on_id}`}:${з.after && з.after.positions_id}`;
  if (entity === 'staff_row') return `staff:${з.entity_id}`;
  throw new Error(`невідома заявка ${entity}.${action}`);
}

/** Знімок `before` на момент подачі: лише поля, які клуб може міняти, + ключі для показу. */
function знімокДо(entity, запис) {
  if (!запис) return null;
  if (entity === 'club') return { id: запис.id, TeamName: запис.TeamName ?? null, ...вибрати(запис, ПОЛЯ_КЛУБУ) };
  if (entity === 'person') return { id: запис.id, ...вибрати(запис, ПОЛЯ_ОСОБИ) };
  if (entity === 'squad_row') return { id: запис.id, player_id: запис.player_id, teaminfo_id: запис.teaminfo_id, leagues_id: запис.leagues_id, Date: запис.Date ?? null, End_date: запис.End_date ?? null, Relevance_of_the_record: запис.Relevance_of_the_record, ...вибрати(запис, ПОЛЯ_СКЛАДУ) };
  if (entity === 'staff_row') return { id: запис.id, people_id: запис.people_id, teaminfo_id: запис.teaminfo_id, leagues_id: запис.leagues_id ?? null, Date: запис.Date ?? null, end_date: запис.end_date ?? null, Relevance_of_the_record: запис.Relevance_of_the_record, ...вибрати(запис, ПОЛЯ_ШТАБУ) };
  return null;
}

/** Клуб може приймати заявки складу/штабу: існує й це клуб АФУ (не збірна, не іноземний). */
function клубПридатний(клуб) {
  if (!клуб) return невдача('Клуб не знайдено');
  if (є(клуб.team_kind)) return невдача('Для збірних та іноземних клубів склад і штаб не ведуться');
  return { ok: true };
}

/** Родина клубу: сам, материнський, дочірні клубу й материнського (як roster-add у CRM). */
function родина(клуб, усіКлуби) {
  const ціль = клуб.id;
  const батько = клуб.parent_teaminfo_id || 0;
  const р = new Set([ціль]);
  if (батько) р.add(батько);
  for (const к of усіКлуби || []) {
    if (к.parent_teaminfo_id && (к.parent_teaminfo_id === ціль || (батько && к.parent_teaminfo_id === батько))) р.add(к.id);
  }
  return р;
}

/**
 * Заявкове вікно турніру (контракт 1.1, 2.5): відкрито, якщо правила «лише в період» немає
 * або зараз усередині одного з вікон. `зараз` — мс. Повертає {open, next} (next — мс або null).
 */
function вікно(правило, вікна, зараз) {
  const вПеріод = (вікна || []).some(в => в.starts_at <= зараз && зараз < в.ends_at);
  const наступні = (вікна || []).filter(в => в.starts_at > зараз).map(в => в.starts_at).sort((a, b) => a - b);
  return { open: !(правило && правило.window_only === true) || вПеріод, next: наступні.length ? наступні[0] : null };
}

/**
 * club.update → поля для db.patch TeamInfo. Порожній набір — невдача (нічого застосовувати).
 */
function планКлубу(заявка, клуб) {
  if (!клуб) return невдача('Клуб не знайдено');
  const дані = вибрати(заявка.after, ПОЛЯ_КЛУБУ);
  // venue_suggestion — пропозиція нової арени текстом (CRM 2.1): у TeamInfo не пишеться, АФУ заводить
  // арену сама. Заявка лише з нею — застосовується без запису (АФУ побачить текст на «Погодженні»).
  const пропозиціяАрени = заявка.after && є(заявка.after.venue_suggestion) ? String(заявка.after.venue_suggestion) : null;
  if (!Object.keys(дані).length) return пропозиціяАрени ? { ok: true, table: 'TeamInfo', id: клуб.id, patch: {}, venue_suggestion: пропозиціяАрени } : невдача('У заявці немає полів, які клуб може змінювати');
  for (const к of ['kit_color_primary', 'kit_color_secondary']) {
    if (є(дані[к]) && !/^#[0-9A-Fa-f]{6}$/.test(дані[к])) return невдача('Колір форми має бути у форматі #RRGGBB');
  }
  if (є(дані.founded_year) && !(Number.isInteger(Number(дані.founded_year)) && дані.founded_year >= 1850 && дані.founded_year <= 2100)) return невдача('Рік заснування поза межами');
  if (є(дані.TeamInfo) && String(дані.TeamInfo).length > 2000) return невдача('Довідка «Про клуб» довша за 2000 знаків');
  return { ok: true, table: 'TeamInfo', id: клуб.id, patch: дані, venue_suggestion: пропозиціяАрени };
}

/**
 * person.create / person.update → дані для db.add / db.patch People.
 * `двійники` — наявні особи з тим самим прізвищем і датою народження (CRM шукає без регістру).
 */
function планОсоби(заявка, особа, двійники) {
  const дані = вибрати(заявка.after, ПОЛЯ_ОСОБИ);
  if (заявка.action === 'create') {
    if (!є(String(дані.prizvushche || '').trim()) || !є(String(дані.Name || '').trim())) return невдача("Прізвище та ім'я обов'язкові");
    if (!є(дані.Date_of_birth)) return невдача("Дата народження обов'язкова — без неї не перевірити, чи особа вже є");
    const інші = (двійники || []).filter(д => д.id !== заявка.entity_id);
    if (інші.length) return невдача(`Така особа вже є в базі (id ${інші.map(д => д.id).join(', ')}): виберіть наявну замість нової`);
    return { ok: true, table: 'People', add: дані };
  }
  if (!особа) return невдача('Особу не знайдено');
  if (!Object.keys(дані).length) return невдача('У заявці немає полів особи');
  if ('prizvushche' in дані && !є(String(дані.prizvushche || '').trim())) return невдача("Прізвище не може бути порожнім");
  if ('Name' in дані && !є(String(дані.Name || '').trim())) return невдача("Ім'я не може бути порожнім");
  return { ok: true, table: 'People', id: особа.id, patch: дані };
}

/**
 * Статус особи з `person.create` за статусами її рядків складу/штабу (рішення Андрія 26.10):
 * 'apply' — погоджено хоч один рядок; 'reject' — повернуто всі; 'wait' — ще є без рішення.
 */
function рішенняОсоби(статусиРядків) {
  const с = статусиРядків || [];
  if (!с.length) return 'wait';
  if (с.some(x => x === 'approved' || x === 'applied')) return 'apply';
  if (с.every(x => x === 'rejected')) return 'reject';
  return 'wait';
}

/**
 * squad_row.create / transfer → план запису Team.
 * ctx: {клуб, усіКлуби, особа, активніОсоби (усі активні Team особи), складТурніру (активні Team клубу в цьому
 *       турнірі), позиції (Positions), вікно: {open}, сьогодні: 'YYYY-MM-DD', кількаТурнірів: bool}
 */
function планДодатиДоСкладу(заявка, ctx) {
  const к = клубПридатний(ctx.клуб);
  if (!к.ok) return к;
  if (!ctx.особа) return невдача('Особу не знайдено (якщо вона нова — спершу має бути застосована її заявка)');
  if (!є(заявка.leagues_id)) return невдача('Не вказано турнір');
  if (!ctx.вікно || !ctx.вікно.open) return невдача('Поза заявковим періодом турніру');
  const a = заявка.after || {};
  const номер = Number(a.Number);
  if (!Number.isInteger(номер) || номер <= 0) return невдача('Ігровий номер обов\'язковий і не може бути 0');
  if (номер > 99) return невдача('Ігровий номер — від 1 до 99');
  const позиція = (ctx.позиції || []).find(п => п.id === a.positions_id);
  if (!позиція || позиція.Player_position !== true) return невдача('Позиція гравця — Воротар або Універсал');
  const зайнятий = (ctx.складТурніру || []).find(р => Number(р.Number) === номер && р.player_id !== ctx.особа.id);
  if (зайнятий) return невдача(`Номер ${номер} уже має інший гравець цього клубу в турнірі`);
  const сім = родина(ctx.клуб, ctx.усіКлуби);
  const план = { ok: true, close: [], kept: [], table: 'Team' };
  for (const р of ctx.активніОсоби || []) {
    if (р.teaminfo_id === ctx.клуб.id) {
      if (р.leagues_id === заявка.leagues_id) return невдача('Гравець уже в чинному складі цього клубу в цьому турнірі');
      // Варіант 3 (контракт 4.2, розділ 5): основний рядок Team лишається, інший турнір — рядок team_league.
      // Варіант 3 — за замовчуванням (рішення Андрія 30.10); вимкнути — ctx.додатковіТурніри = false.
      if (ctx.додатковіТурніри !== false) {
        if ((ctx.додатковіОсоби || []).some(д => д.team_id === р.id && д.leagues_id === заявка.leagues_id && д.is_active !== false)) return невдача('Гравець уже заявлений клубом у цей турнір');
        const наявний = (ctx.додатковіОсоби || []).find(д => д.team_id === р.id && д.leagues_id === заявка.leagues_id);
        return { ok: true, table: 'team_league', team_id: р.id, ...(наявний ? { id: наявний.id, edit: { is_active: true, Number: номер, Date: ctx.сьогодні, End_date: null } } : { add: { team_id: р.id, people_id: ctx.особа.id, teaminfo_id: ctx.клуб.id, leagues_id: заявка.leagues_id, Number: номер, Date: ctx.сьогодні, is_active: true } }) };
      }
      if (!ctx.кількаТурнірів) return невдача('Гравець уже в чинному складі цього клубу в іншому турнірі; кілька турнірів одночасно — після рішення АФУ (контракт 4.2, відкрите питання)');
      план.kept.push(р.id);
      continue;
    }
    if (сім.has(р.teaminfo_id)) { план.kept.push(р.id); continue; }
    if (String(р.Date || '') >= ctx.сьогодні) return невдача('У гравця є чинна заявка в іншому клубі з датою не раніше за сьогоднішню — АФУ має спершу її закрити');
    план.close.push(р.id);
  }
  if (заявка.action === 'create' && план.close.length) return невдача('Гравець активний в іншому клубі — це перехід, а не нове додавання');
  if (заявка.action === 'transfer' && !план.close.length) return невдача('Перехід, але чинної заявки в іншому клубі вже немає — подайте як додавання');
  план.add = { player_id: ctx.особа.id, teaminfo_id: ctx.клуб.id, leagues_id: заявка.leagues_id, Number: номер, positions_id: a.positions_id, Captain: a.Captain === true, Date: ctx.сьогодні, Relevance_of_the_record: true };
  план.closeData = { Relevance_of_the_record: false, End_date: ctx.сьогодні };
  return план;
}

/**
 * squad_row.update → db.patch Team (номер, позиція, капітан). Варіант 3: якщо заявка про додатковий турнір
 * (leagues_id ≠ Team.leagues_id), змінюється лише номер у рядку team_league (ctx.додатковіОсоби).
 */
function планЗмінитиСклад(заявка, рядок, ctx) {
  if (!рядок || рядок.Relevance_of_the_record === false) return невдача('Запис складу не знайдено або вже не чинний');
  if (рядок.teaminfo_id !== заявка.teaminfo_id) return невдача('Запис складу належить іншому клубу');
  if (є(заявка.leagues_id) && заявка.leagues_id !== рядок.leagues_id) {
    const д = (ctx.додатковіОсоби || []).find(x => x.team_id === рядок.id && x.leagues_id === заявка.leagues_id && x.is_active !== false);
    if (!д) return невдача('Гравець не заявлений клубом у цей турнір');
    const н = Number((заявка.after || {}).Number);
    if (!Number.isInteger(н) || н <= 0 || н > 99) return невдача('Ігровий номер — від 1 до 99');
    const зайнятий = (ctx.складТурніру || []).find(р => Number(р.Number) === н && р.player_id !== рядок.player_id);
    if (зайнятий) return невдача(`Номер ${н} уже має інший гравець цього клубу в турнірі`);
    return { ok: true, table: 'team_league', id: д.id, patch: { Number: н } };
  }
  const дані = вибрати(заявка.after, ПОЛЯ_СКЛАДУ);
  if (!Object.keys(дані).length) return невдача('У заявці немає полів складу');
  if ('Number' in дані) {
    const номер = Number(дані.Number);
    if (!Number.isInteger(номер) || номер <= 0 || номер > 99) return невдача('Ігровий номер — від 1 до 99');
    const зайнятий = (ctx.складТурніру || []).find(р => Number(р.Number) === номер && р.id !== рядок.id);
    if (зайнятий) return невдача(`Номер ${номер} уже має інший гравець цього клубу в турнірі`);
    дані.Number = номер;
  }
  if ('positions_id' in дані) {
    const позиція = (ctx.позиції || []).find(п => п.id === дані.positions_id);
    if (!позиція || позиція.Player_position !== true) return невдача('Позиція гравця — Воротар або Універсал');
  }
  if ('Captain' in дані) дані.Captain = дані.Captain === true;
  return { ok: true, table: 'Team', id: рядок.id, patch: дані };
}

/** squad_row.remove → закрити рядок (історія лишається). Виведення — поза вікном теж заборонене. */
function планВивестиЗіСкладу(заявка, рядок, ctx) {
  if (!рядок || рядок.Relevance_of_the_record === false) return невдача('Запис складу не знайдено або вже не чинний');
  if (рядок.teaminfo_id !== заявка.teaminfo_id) return невдача('Запис складу належить іншому клубу');
  if (!ctx.вікно || !ctx.вікно.open) return невдача('Поза заявковим періодом турніру');
  const дата = є(заявка.after && заявка.after.End_date) ? заявка.after.End_date : ctx.сьогодні;
  if (дата > ctx.сьогодні) return невдача('Дата виведення не може бути в майбутньому');
  if (є(рядок.Date) && дата < рядок.Date) return невдача('Дата виведення раніша за дату заявки гравця');
  return { ok: true, table: 'Team', id: рядок.id, edit: { Relevance_of_the_record: false, End_date: дата } };
}

/** staff_row.create → db.add Administration of teams. */
function планДодатиШтаб(заявка, ctx) {
  const к = клубПридатний(ctx.клуб);
  if (!к.ok) return к;
  if (!ctx.особа) return невдача('Особу не знайдено (якщо вона нова — спершу має бути застосована її заявка)');
  const позиція = (ctx.позиції || []).find(п => п.id === (заявка.after || {}).positions_id);
  if (!позиція || позиція.Player_position === true) return невдача('Оберіть посаду штабу');
  const дубль = (ctx.штабКлубу || []).some(р => р.people_id === ctx.особа.id && р.positions_id === позиція.id && р.Relevance_of_the_record !== false);
  if (дубль) return невдача('Ця особа вже на цій посаді в цьому клубі');
  return { ok: true, table: 'Administration of teams', add: { people_id: ctx.особа.id, teaminfo_id: ctx.клуб.id, positions_id: позиція.id, leagues_id: заявка.leagues_id ?? null, Date: ctx.сьогодні, Relevance_of_the_record: true } };
}

/** staff_row.update → змінити посаду. */
function планЗмінитиШтаб(заявка, рядок, ctx) {
  if (!рядок || рядок.Relevance_of_the_record === false) return невдача('Запис штабу не знайдено або вже не чинний');
  if (рядок.teaminfo_id !== заявка.teaminfo_id) return невдача('Запис штабу належить іншому клубу');
  const позиція = (ctx.позиції || []).find(п => п.id === (заявка.after || {}).positions_id);
  if (!позиція || позиція.Player_position === true) return невдача('Оберіть посаду штабу');
  const дубль = (ctx.штабКлубу || []).some(р => р.id !== рядок.id && р.people_id === рядок.people_id && р.positions_id === позиція.id && р.Relevance_of_the_record !== false);
  if (дубль) return невдача('Ця особа вже на цій посаді в цьому клубі');
  return { ok: true, table: 'Administration of teams', id: рядок.id, patch: { positions_id: позиція.id } };
}

/** staff_row.remove → закрити запис штабу. */
function планВивестиШтаб(заявка, рядок, ctx) {
  if (!рядок || рядок.Relevance_of_the_record === false) return невдача('Запис штабу не знайдено або вже не чинний');
  if (рядок.teaminfo_id !== заявка.teaminfo_id) return невдача('Запис штабу належить іншому клубу');
  const дата = є(заявка.after && заявка.after.end_date) ? заявка.after.end_date : ctx.сьогодні;
  if (дата > ctx.сьогодні) return невдача('Дата виведення не може бути в майбутньому');
  return { ok: true, table: 'Administration of teams', id: рядок.id, edit: { Relevance_of_the_record: false, end_date: дата } };
}

/**
 * Варіант 3: вивести гравця з ОДНОГО турніру клубу. `рядок` — основний рядок Team, `додаткові` — його
 * рядки team_league. Додатковий турнір → вимкнути рядок team_league. Основний, а є інші активні →
 * перенести Team.leagues_id і Number на найраніший додатковий і вимкнути той team_league. Основний і
 * останній → закрити Team (як планВивестиЗіСкладу) і вимкнути все додаткове.
 */
function планВивестиЗТурніру(заявка, рядок, додаткові, ctx) {
  if (!рядок || рядок.Relevance_of_the_record === false) return невдача('Запис складу не знайдено або вже не чинний');
  if (рядок.teaminfo_id !== заявка.teaminfo_id) return невдача('Запис складу належить іншому клубу');
  if (!ctx.вікно || !ctx.вікно.open) return невдача('Поза заявковим періодом турніру');
  const ліга = заявка.leagues_id ?? рядок.leagues_id;
  const дата = є(заявка.after && заявка.after.End_date) ? заявка.after.End_date : ctx.сьогодні;
  if (дата > ctx.сьогодні) return невдача('Дата виведення не може бути в майбутньому');
  const активні = (додаткові || []).filter(д => д.team_id === рядок.id && д.is_active !== false);
  if (ліга !== рядок.leagues_id) {
    const д = активні.find(x => x.leagues_id === ліга);
    if (!д) return невдача('Гравець не заявлений клубом у цей турнір');
    return { ok: true, table: 'team_league', id: д.id, edit: { is_active: false, End_date: дата } };
  }
  if (активні.length) {
    const наступний = [...активні].sort((a, b) => String(a.Date || '').localeCompare(String(b.Date || '')) || a.id - b.id)[0];
    return { ok: true, table: 'Team', id: рядок.id, patch: { leagues_id: наступний.leagues_id, Number: наступний.Number }, також: { table: 'team_league', id: наступний.id, edit: { is_active: false, End_date: дата } } };
  }
  if (є(рядок.Date) && дата < рядок.Date) return невдача('Дата виведення раніша за дату заявки гравця');
  return { ok: true, table: 'Team', id: рядок.id, edit: { Relevance_of_the_record: false, End_date: дата } };
}

/** Варіант 3: номер у турнірі зайнятий? Рахуються і основні рядки Team цього турніру, і team_league. */
function номерЗайнятий(номер, особа, рядкиTeamТурніру, рядкиДодатковіТурніру) {
  const н = Number(номер);
  return (рядкиTeamТурніру || []).some(р => Number(р.Number) === н && р.player_id !== особа && р.Relevance_of_the_record !== false)
    || (рядкиДодатковіТурніру || []).some(р => Number(р.Number) === н && р.people_id !== особа && р.is_active !== false);
}

/**
 * Залежність: заявку з depends_on_id можна застосовувати лише після того, як її person.create
 * застосовано (`applied` з applied_entity_id). Повертає {ok, people_id} або невдачу / очікування.
 */
function залежність(заявка, батько) {
  if (!заявка.depends_on_id) return { ok: true, people_id: заявка.people_id };
  if (!батько) return невдача('Заявка на нову особу, від якої залежить ця, не знайдена');
  if (батько.status === 'applied' && батько.applied_entity_id) return { ok: true, people_id: батько.applied_entity_id };
  if (батько.status === 'failed') return невдача('Не вдалося створити нову особу — спершу розберіться з її заявкою');
  if (батько.status === 'rejected') return невдача('Заявку на нову особу повернуто');
  return { ok: false, wait: true, failed: null };
}

/** Поля заявки після рішення: open_key завжди стає null (звільняє запис для нової заявки). */
function підсумокЗаявки(план, рішення, хто, коли, id) {
  if (рішення === 'rejected') return { status: 'rejected', open_key: null, decision_users_id: хто, decided_at: коли };
  if (!план.ok) return { status: 'failed', open_key: null, apply_error: план.failed, decision_users_id: хто, decided_at: коли };
  return { status: 'applied', open_key: null, decision_users_id: хто, decided_at: коли, applied_at: коли, applied_entity_id: id ?? null, apply_error: null };
}
        // /ПРАВИЛА 4.2

            // ——— Склейка CRM: заявка + прочитані рядки → кроки запису (нічого не пише) ———
            const зараз = Date.now();
            let сьогодні;
            try {
              сьогодні = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(зараз));
            } catch (e) {
              сьогодні = new Date(зараз).toISOString().slice(0, 10);
            }
            const з = $var.row;
            const клуби = $var.clubs || [];
            const клуб = клуби.find((к) => к.id === з.teaminfo_id) || null;
            const люди = $var.people || [];
            const картки = $var.cards || [];
            const додаткові = $var.extra || [];
            const діє = (к) => к.Relevance_of_the_record !== false && (!є(к.End_date) || String(к.End_date) >= сьогодні);
            const діюДод = (д) => д.is_active !== false && (!є(д.End_date) || String(д.End_date) >= сьогодні);
            const батько = ($var.parent_list || [])[0] || null;
            const нормПр = (s) => String(s || '').trim().toLowerCase();
            const двійникиДля = (а) => люди.filter((p) => нормПр(p.prizvushche) === нормПр(а && а.prizvushche) && String(p.Date_of_birth || '').slice(0, 10) === String((а && а.Date_of_birth) || '').slice(0, 10));
            // Фото з after (і нової особи, від якої залежить рядок): файл має існувати у vault (контракт 4.2, d7058d0)
            const відсутні = ($var.images || []).filter((і) => Number(і.status) !== 200).map((і) => і.path);
            const вікноЛіги = (id) => вікно(($var.rules || []).find((р) => р.leagues_id === id) || null, ($var.windows || []).filter((в) => в.leagues_id === id).map((в) => ({ starts_at: Number(в.starts_at), ends_at: Number(в.ends_at) })), зараз);
            const складТурніру = (ліга) => картки.filter((к) => к.teaminfo_id === з.teaminfo_id && к.leagues_id === ліга && діє(к))
              .concat(додаткові.filter((д) => д.teaminfo_id === з.teaminfo_id && д.leagues_id === ліга && діюДод(д)).map((д) => ({ id: -д.id, player_id: д.people_id, Number: д.Number })));
            const кроки = [];
            let особаВпала = false; // нова особа не пройшла правила — її заявка й інші рядки теж failed
            let особаКрок = null; // нова особа (person.create, від якої залежить рядок) — пишеться першою
            let план;
            const НОВА = -1; // id нової особи до запису; кроки з person = true отримають справжній

            if (відсутні.length) план = невдача('Файл зображення не знайдено — завантажте його знову');
            else if (з.entity === 'club') {
              план = планКлубу(з, клуб);
              if (план.ok && Object.keys(план.patch || {}).length) кроки.push({ table: 'TeamInfo', op: 'patch', id: план.id, data: план.patch, label: 'картку клубу змінено' });
            } else if (з.entity === 'person') {
              const о = з.entity_id ? люди.find((p) => p.id === з.entity_id) || null : null;
              план = планОсоби(з, о, з.action === 'create' ? двійникиДля(з.after) : []);
              if (план.ok && план.add) особаКрок = { data: план.add, request_id: з.id };
              if (план.ok && план.patch) кроки.push({ table: 'People', op: 'patch', id: план.id, data: план.patch, label: 'дані особи змінено' });
            } else {
              // Рядок складу / штабу: особа — наявна або нова (її person.create застосовується першою)
              let особа = null;
              if (з.depends_on_id) {
                if (!батько) план = невдача('Заявка на нову особу, від якої залежить ця, не знайдена');
                else if (батько.status === 'submitted' || батько.status === 'approved') {
                  const п = планОсоби(батько, null, двійникиДля(батько.after));
                  if (!п.ok) {
                    план = п;
                    особаВпала = true;
                  } else {
                    особаКрок = { data: п.add, request_id: батько.id };
                    особа = { id: НОВА };
                  }
                } else {
                  const д = залежність(з, батько);
                  if (!д.ok) план = д.wait ? невдача('Нова особа ще не створена') : д;
                  else особа = люди.find((p) => p.id === д.people_id) || null;
                }
              } else особа = з.people_id ? люди.find((p) => p.id === з.people_id) || null : null;

              if (!план) {
                const ctx = {
                  клуб, усіКлуби: клуби, особа, сьогодні, позиції: $var.positions || [],
                  активніОсоби: особа && особа.id !== НОВА ? картки.filter((к) => к.player_id === особа.id && діє(к)) : [],
                  додатковіОсоби: додаткові,
                  складТурніру: з.leagues_id ? складТурніру(з.leagues_id) : [],
                  вікно: з.leagues_id ? вікноЛіги(з.leagues_id) : null,
                  штабКлубу: $var.staff || [],
                };
                const рядок = з.entity_id ? (з.entity === 'squad_row' ? картки.find((к) => к.id === з.entity_id) : ($var.staff || []).find((с) => с.id === з.entity_id)) || null : null;
                if (з.entity === 'squad_row' && (з.action === 'create' || з.action === 'transfer')) {
                  план = планДодатиДоСкладу(з, ctx);
                  if (план.ok && план.table === 'Team') {
                    // Порядок (контракт 4.2): спершу новий рядок, потім закриття старих
                    кроки.push({ table: 'Team', op: 'add', data: план.add, person: 'player_id', label: 'гравця додано до складу', created: true });
                    for (const id of план.close || []) {
                      кроки.push({ table: 'Team', op: 'patch', id, data: план.closeData, label: `закрито рядок складу №${id} у старому клубі` });
                      // Закриваючи чужий Team, вимкнути й усі його додаткові турніри (варіант 3)
                      for (const д of додаткові.filter((x) => x.team_id === id && діюДод(x))) кроки.push({ table: 'team_league', op: 'patch', id: д.id, data: { is_active: false, End_date: сьогодні }, label: `вимкнено додатковий турнір №${д.id} у старому клубі` });
                    }
                  } else if (план.ok && план.table === 'team_league') {
                    if (план.add) кроки.push({ table: 'team_league', op: 'add', data: план.add, person: 'people_id', label: 'гравця додано в додатковий турнір', created: true });
                    else кроки.push({ table: 'team_league', op: 'patch', id: план.id, data: план.edit, label: 'додатковий турнір гравця увімкнено знову', applied_id: план.id });
                  }
                } else if (з.entity === 'squad_row' && з.action === 'update') {
                  план = планЗмінитиСклад(з, рядок, ctx);
                  if (план.ok) кроки.push({ table: план.table, op: 'patch', id: план.id, data: план.patch, label: план.table === 'Team' ? 'рядок складу змінено' : 'номер у додатковому турнірі змінено' });
                } else if (з.entity === 'squad_row' && з.action === 'remove') {
                  const ліга = з.leagues_id || (рядок && рядок.leagues_id);
                  план = планВивестиЗТурніру(з, рядок, додаткові, { ...ctx, вікно: ліга ? вікноЛіги(ліга) : null });
                  if (план.ok) {
                    кроки.push({ table: план.table, op: 'patch', id: план.id, data: план.edit || план.patch, label: план.patch ? 'основний турнір гравця змінено' : план.table === 'Team' ? 'гравця виведено зі складу' : 'гравця виведено з додаткового турніру' });
                    if (план.також) кроки.push({ table: план.також.table, op: 'patch', id: план.також.id, data: план.також.edit, label: 'колишній додатковий турнір вимкнено' });
                  }
                } else if (з.entity === 'staff_row' && з.action === 'create') {
                  план = планДодатиШтаб(з, ctx);
                  if (план.ok) кроки.push({ table: 'Administration of teams', op: 'add', data: план.add, person: 'people_id', label: 'людину додано до штабу', created: true });
                } else if (з.entity === 'staff_row' && з.action === 'update') {
                  план = планЗмінитиШтаб(з, рядок, ctx);
                  if (план.ok) кроки.push({ table: 'Administration of teams', op: 'patch', id: план.id, data: план.patch, label: 'посаду змінено' });
                } else if (з.entity === 'staff_row' && з.action === 'remove') {
                  план = планВивестиШтаб(з, рядок, ctx);
                  if (план.ok) кроки.push({ table: 'Administration of teams', op: 'patch', id: план.id, data: план.edit, label: 'людину виведено зі штабу' });
                } else план = невдача('Невідомий тип заявки');
              }
            }
            return {
              ok: !!(план && план.ok),
              failed: план && !план.ok ? план.failed || 'Не вдалося застосувати' : null,
              person: план && план.ok ? особаКрок : null,
              // нова особа впала (двійник тощо) — сама її заявка й інші рядки теж failed (рецензія Backend 4.1, п. 2)
              person_failed: особаВпала,
              person_request_id: з.depends_on_id || null,
              steps: план && план.ok ? кроки : [],
              applied_id: (кроки.find((к) => к.applied_id) || {}).applied_id || null,
              venue_suggestion: план && план.venue_suggestion ? план.venue_suggestion : null,
              today: сьогодні,
            };
          """
          timeout = 20
        } as $plan_try
        var.update $plan {
          value = $plan_try
        }
      }
      catch {
        api.lambda {
          code = """
            return { ok: false, failed: 'Внутрішня помилка під час перевірки чи плану — повідомте Backend', person: null, person_failed: false, person_request_id: null, steps: [], applied_id: null };
          """
          timeout = 5
        } as $plan_crashed
        var.update $plan {
          value = $plan_crashed
        }
      }
    }

    // 4а. План не пройшов — failed з текстом правила
    conditional {
      if ($plan.ok == false) {
        db.direct_query {
          sql = """
            UPDATE x1_93 SET status = 'failed' WHERE id = ? AND status = 'approved' RETURNING id;
            """
          response_type = "list"
          arg = $input.request_id
        } as $failed_cas
        db.edit change_request {
          field_name = "id"
          field_value = $input.request_id
          data = {updated_at: "now", apply_error: $plan.failed, open_key: null}
        } as $failed_row
        // Особу ми захопили, але впала не вона — звільнити для інших рядків
        conditional {
          if ($claimed && $plan.person_failed == false) {
            db.direct_query {
              sql = """
                UPDATE x1_93 SET status = 'submitted' WHERE id = ? AND status = 'approved' RETURNING id;
                """
              response_type = "list"
              arg = $row.depends_on_id
            } as $released_person
          }
        }
        // Нова особа не пройшла правила — її заявка й інші її рядки теж failed
        conditional {
          if ($plan.person_failed) {
            db.direct_query {
              sql = """
                UPDATE x1_93 SET status = 'failed'
                WHERE ((id = ? AND status IN ('submitted', 'approved')) OR (depends_on_id = ? AND status = 'submitted'))
                RETURNING id;
                """
              response_type = "list"
              arg = $plan.person_request_id
              arg = $plan.person_request_id
            } as $failed_family
            foreach ($failed_family) {
              each as $f {
                db.edit change_request {
                  field_name = "id"
                  field_value = $f.id
                  data = {updated_at: "now", decided_at: "now", decision_users_id: $auth.id, apply_error: $plan.failed, open_key: null}
                } as $failed_member
              }
            }
          }
        }
      }
    }

    // 4б. План пройшов — записи
    conditional {
      if ($plan.ok) {
        var $done {
          value = []
        }
        var $new_person {
          value = null
        }
        var $created {
          value = null
        }
        try_catch {
          try {
            conditional {
              if ($plan.person != null) {
                db.add People {
                  data = $plan.person.data
                } as $person_row
                var.update $new_person {
                  value = $person_row.id
                }
                db.direct_query {
                  sql = """
                    UPDATE x1_93 SET status = 'applied' WHERE id = ? AND status = 'approved' RETURNING id;
                    """
                  response_type = "list"
                  arg = $plan.person.request_id
                } as $person_cas
                db.edit change_request {
                  field_name = "id"
                  field_value = $plan.person.request_id
                  data = {updated_at: "now", decided_at: "now", decision_users_id: $auth.id, applied_at: "now", applied_entity_id: $person_row.id, apply_error: null, open_key: null}
                } as $person_applied
                var.update $done {
                  value = $done|push:"нову особу створено"
                }
              }
            }
            // id нової особи — у кроки, що на неї посилаються
            api.lambda {
              code = """
                return ($var.plan.steps || []).map((к) => (к.person && $var.new_person ? { ...к, data: { ...к.data, [к.person]: $var.new_person } } : к));
              """
              timeout = 5
            } as $steps
            foreach ($steps) {
              each as $step {
            conditional {
              if ($step.op == "add" && $step.table == "Team") {
                db.add Team {
                  data = $step.data
                } as $added
                var.update $created {
                  value = $added.id
                }
              }
            }
            conditional {
              if ($step.op == "add" && $step.table == "team_league") {
                db.add team_league {
                  data = $step.data
                } as $added
                var.update $created {
                  value = $added.id
                }
              }
            }
            conditional {
              if ($step.op == "add" && $step.table == "Administration of teams") {
                db.add "Administration of teams" {
                  data = $step.data
                } as $added
                var.update $created {
                  value = $added.id
                }
              }
            }
            conditional {
              if ($step.op == "patch" && $step.table == "TeamInfo") {
                db.patch TeamInfo {
                  field_name = "id"
                  field_value = $step.id
                  data = $step.data
                } as $patched
              }
            }
            conditional {
              if ($step.op == "patch" && $step.table == "People") {
                db.patch People {
                  field_name = "id"
                  field_value = $step.id
                  data = $step.data
                } as $patched
              }
            }
            conditional {
              if ($step.op == "patch" && $step.table == "Team") {
                db.patch Team {
                  field_name = "id"
                  field_value = $step.id
                  data = $step.data
                } as $patched
              }
            }
            conditional {
              if ($step.op == "patch" && $step.table == "team_league") {
                db.patch team_league {
                  field_name = "id"
                  field_value = $step.id
                  data = $step.data
                } as $patched
              }
            }
            conditional {
              if ($step.op == "patch" && $step.table == "Administration of teams") {
                db.patch "Administration of teams" {
                  field_name = "id"
                  field_value = $step.id
                  data = $step.data
                } as $patched
              }
            }
                var.update $done {
                  value = $done|push:$step.label
                }
              }
            }
            api.lambda {
              code = """
                return $var.created || $var.plan.applied_id || $var.new_person || null;
              """
              timeout = 5
            } as $applied_id
            db.direct_query {
              sql = """
                UPDATE x1_93 SET status = 'applied' WHERE id = ? AND status = 'approved' RETURNING id;
                """
              response_type = "list"
              arg = $input.request_id
            } as $applied_cas
            db.edit change_request {
              field_name = "id"
              field_value = $input.request_id
              data = {updated_at: "now", applied_at: "now", applied_entity_id: $applied_id, apply_error: null, open_key: null}
            } as $applied_row
          }
          catch {
            api.lambda {
              code = """
                const зроблено = ($var.done || []).join('; ');
                return 'Помилка запису в Xano посеред застосування. Зроблено: ' + (зроблено || 'нічого') + '. Перевірте й виправте вручну';
              """
              timeout = 5
            } as $error_text
            db.direct_query {
              sql = """
                UPDATE x1_93 SET status = 'failed' WHERE id = ? AND status = 'approved' RETURNING id;
                """
              response_type = "list"
              arg = $input.request_id
            } as $crashed_cas
            db.edit change_request {
              field_name = "id"
              field_value = $input.request_id
              data = {updated_at: "now", apply_error: $error_text, open_key: null}
            } as $crashed_row
            // Особу захопили, але не створили — звільнити для інших рядків
            conditional {
              if ($claimed && $new_person == null) {
                db.direct_query {
                  sql = """
                    UPDATE x1_93 SET status = 'submitted' WHERE id = ? AND status = 'approved' RETURNING id;
                    """
                  response_type = "list"
                  arg = $row.depends_on_id
                } as $released_after_crash
              }
            }
            // Особу вже створено (People є), але збій стався до її applied — застосувати
            // заявку особи, інакше її рядки назавжди казали б «спробуйте ще раз»
            conditional {
              if ($claimed && $new_person != null) {
                db.direct_query {
                  sql = """
                    UPDATE x1_93 SET status = 'applied' WHERE id = ? AND status = 'approved' RETURNING id;
                    """
                  response_type = "list"
                  arg = $row.depends_on_id
                } as $person_rescued
                db.edit change_request {
                  field_name = "id"
                  field_value = $row.depends_on_id
                  data = {updated_at: "now", decided_at: "now", decision_users_id: $auth.id, applied_at: "now", applied_entity_id: $new_person, apply_error: null, open_key: null}
                } as $person_rescued_row
              }
            }
          }
        }
      }
    }

    // 5. Нова особа: рядки остаточні й жоден не застосовано → її остаточний статус
    // (повернуто всі — rejected, інакше failed)
    conditional {
      if ($row.depends_on_id != null) {
        db.direct_query {
          sql = """
            UPDATE x1_93 p
            SET status = CASE WHEN EXISTS (SELECT 1 FROM x1_93 r WHERE r.depends_on_id = p.id AND r.status = 'failed') THEN 'failed' ELSE 'rejected' END
            WHERE p.id = ? AND p.status = 'submitted'
              AND NOT EXISTS (SELECT 1 FROM x1_93 r WHERE r.depends_on_id = p.id AND r.status IN ('submitted', 'approved', 'applied'))
            RETURNING id;
            """
          response_type = "list"
          arg = $row.depends_on_id
        } as $person_final
        conditional {
          if (($person_final|count) > 0) {
            db.edit change_request {
              field_name = "id"
              field_value = $row.depends_on_id
              data = {updated_at: "now", decided_at: "now", decision_users_id: $auth.id, decision_comment: "Жоден рядок складу чи штабу не застосовано", open_key: null}
            } as $person_closed
          }
        }
      }
    }

    // Пакет закривається за рядками: не лишилось submitted / approved
    db.direct_query {
      sql = """
        UPDATE x1_92 SET status = 'closed'
        WHERE id = ? AND status = 'submitted'
          AND NOT EXISTS (SELECT 1 FROM x1_93 r WHERE r.batch_id = x1_92.id AND r.status IN ('submitted', 'approved'))
        RETURNING id;
        """
      response_type = "list"
      arg = $row.batch_id
    } as $closed
    conditional {
      if (($closed|count) > 0) {
        db.edit change_batch {
          field_name = "id"
          field_value = $row.batch_id
          data = {closed_at: "now"}
        } as $batch_closed
      }
    }

    db.get change_request {
      field_name = "id"
      field_value = $input.request_id
      output = ["id", "status", "apply_error", "applied_entity_id"]
    } as $final
  }

  response = $final
}
