query client_errors verb=POST {
  api_group = "app"

  // R56. Необроблена помилка застосунку «Футзал АФУ». Без авторизації:
  // помилка буває ще до входу. Захист від сміття — стелі розміру (message 1000, stack 4 КБ) й перевірка
  // платформи; дедуплікація й частота — на пристрої. Даних людини не беремо:
  // ні IP, ні id вболівальника, а e-mail і токени з тексту вирізаємо.
  input {
    text message
    text stack?
    text screen?
    text app_version?
    text build?
    text platform
    text os_version?
    bool is_fatal?=false
    // коли сталося на пристрої: мс від епохи або ISO-рядок
    timestamp at?
  }

  stack {
    api.lambda {
      code = """
        const clean = (v, max) => {
          if (v == null) return null;
          let s = String(v)
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
            .replace(/(Bearer\s+)[A-Za-z0-9._~+\/=-]+/gi, '$1[token]')
            .replace(/ExponentPushToken\[[^\]]*\]/g, 'ExponentPushToken[…]')
            .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]')
            .trim();
          if (!s) return null;
          if (s.length > max) s = s.slice(0, max - 1) + '…';
          return s;
        };
        const message = clean($input.message, 1000);
        if (!message) return { ok: false, error: 'message порожній' };
        const p = String($input.platform || '').trim().toLowerCase();
        if (p !== 'ios' && p !== 'android') return { ok: false, error: 'platform — ios або android' };
        return {
          ok: true,
          error: '',
          row: {
            message,
            stack: clean($input.stack, 4096),
            screen: clean($input.screen, 64),
            app_version: clean($input.app_version, 64),
            build: clean($input.build, 64),
            platform: p,
            os_version: clean($input.os_version, 64),
            is_fatal: $input.is_fatal === true,
          },
        };
      """
      timeout = 10
    } as $v

    precondition ($v.ok == true) {
      error_type = "badrequest"
      error = $v.error
    }

    db.add client_errors {
      data = {
        created_at : "now"
        message    : $v.row.message
        stack      : $v.row.stack
        screen     : $v.row.screen
        app_version: $v.row.app_version
        build      : $v.row.build
        platform   : $v.row.platform
        os_version : $v.row.os_version
        is_fatal   : $v.row.is_fatal
        at         : $input.at
      }
    } as $row
  }

  response = {ok: true, id: $row.id}
}
