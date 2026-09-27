import DOMPurify from 'dompurify';

// Дозволений набір тегів для тексту новини — вимога сайту (afu-crm#1):
// абзаци, h2–h4, жирний, курсив, посилання, списки, цитата, зображення з
// width/height, таблиця, YouTube. Без style, скриптів і атрибутів on*.
// Сервер ще раз чистить небезпечне (news.post / news-id.patch), сайт — під час показу.
const ТЕГИ = ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li', 'blockquote', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col', 'iframe', 'div'];
const АТРИБУТИ = ['href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height', 'colspan', 'rowspan',
  'allowfullscreen', 'frameborder', 'allow', 'data-youtube-video'];
const YOUTUBE = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\//i;

export function cleanNewsHtml(html) {
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'iframe' && !YOUTUBE.test(node.getAttribute('src') || '')) node.parentNode?.removeChild(node);
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer');
      if (/^https?:/i.test(node.getAttribute('href') || '')) node.setAttribute('target', '_blank');
    }
  });
  const out = DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ТЕГИ,
    ALLOWED_ATTR: АТРИБУТИ,
    ADD_TAGS: ['iframe'],
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|tel:|\/|#)/i,
  });
  DOMPurify.removeAllHooks();
  // Порожній редактор TipTap віддає «<p></p>»
  return out.replace(/^<p><\/p>$/, '');
}
