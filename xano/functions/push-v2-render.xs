// R55. Текст пуша з шаблону push_templates (редагується в CRM, сторінка «Пуші»).
// Підставляє {змінні}; невідома чи порожня змінна стає порожньою, а зайві
// роздільники після неї прибираються («, ·», «()», «· ·»). Якщо шаблону немає
// або він порожній — запасний текст із коду. enabled = false — пуш не слати.
function "Push v2 render" {
  input {
    text tpl filters=trim
    json vars?
    text fallback_title?
    text fallback_body?
  }

  stack {
    db.query push_templates {
      where = $db.push_templates.kind == $input.tpl
      return = {type: "single"}
      output = ["title_template", "body_template", "enabled"]
    } as $t

    api.lambda {
      code = """
        const t = $var.t || null;
        const vars = $input.vars && typeof $input.vars === 'object' ? $input.vars : {};
        const fill = (s) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
        const tidy = (s) => s
          .replace(/\(\s*\)/g, '')
          .replace(/\s+,/g, ',')
          .replace(/,\s*(?=·|$)/g, '')
          .replace(/·\s*(?=·|$)/g, '')
          .replace(/^\s*·\s*/, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        const title = tidy(fill(t && t.title_template ? t.title_template : $input.fallback_title));
        const body = tidy(fill(t && t.body_template ? t.body_template : $input.fallback_body));
        return { enabled: !t || t.enabled !== false, title, body, from_template: !!t };
      """
      timeout = 10
    } as $out
  }

  response = $out
}
