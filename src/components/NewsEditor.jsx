import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { TableKit } from '@tiptap/extension-table';
import { crm } from '../api/client.js';

// Редактор тексту новини з обмеженим набором форматування (afu-crm#1):
// абзаци, h2–h4, жирний, курсив, посилання, списки, цитата, зображення,
// таблиця, YouTube. Схема TipTap сама не пропускає інших тегів і style;
// перед збереженням текст ще чистить cleanNewsHtml.

// width і height у кожного зображення — вимога сайту: без них верстка стрибає
const ImageWithSize = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
    };
  },
});

function Кнопка({ on, active, title, disabled, children }) {
  return (
    <button type="button" className={`btn small ${active ? 'primary' : ''}`} title={title} onClick={on} disabled={disabled}>
      {children}
    </button>
  );
}

export default function NewsEditor({ value, onChange, disabled }) {
  const fileRef = useRef(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'] },
      }),
      ImageWithSize.configure({ inline: false }),
      Youtube.configure({ nocookie: true, controls: true, width: 640, height: 360 }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Зовнішнє значення (завантаження новини) — лише коли воно справді інше
  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, value]);

  const стан = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            h4: e.isActive('heading', { level: 4 }),
            ul: e.isActive('bulletList'),
            ol: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            link: e.isActive('link'),
            table: e.isActive('table'),
          }
        : {},
  });

  if (!editor) return null;
  const ch = () => editor.chain().focus();

  const посилання = () => {
    const was = editor.getAttributes('link').href || '';
    const href = window.prompt('Адреса посилання (порожньо — прибрати)', was);
    if (href === null) return;
    if (!href.trim()) return ch().extendMarkRange('link').unsetLink().run();
    ch().extendMarkRange('link').setLink({ href: href.trim() }).run();
  };

  const відео = () => {
    const src = window.prompt('Посилання на відео YouTube');
    if (src) ch().setYoutubeVideo({ src: src.trim() }).run();
  };

  const фото = async (file) => {
    const form = new FormData();
    form.append('image', file);
    const img = await crm.upload('/news/images', form);
    const alt = window.prompt('Опис фото для людей з вадами зору', '') || '';
    ch().setImage({ src: img.url, alt, width: img.meta?.width || null, height: img.meta?.height || null }).run();
  };


  return (
    <div className="news-editor">
      <div className="news-toolbar">
        <Кнопка disabled={disabled} on={() => ch().setParagraph().run()} title="Звичайний абзац">
          Абзац
        </Кнопка>
        <Кнопка disabled={disabled} on={() => ch().toggleHeading({ level: 2 }).run()} active={стан.h2} title="Заголовок 2">
          H2
        </Кнопка>
        <Кнопка disabled={disabled} on={() => ch().toggleHeading({ level: 3 }).run()} active={стан.h3} title="Заголовок 3">
          H3
        </Кнопка>
        <Кнопка disabled={disabled} on={() => ch().toggleHeading({ level: 4 }).run()} active={стан.h4} title="Заголовок 4">
          H4
        </Кнопка>
        <span className="news-toolbar-sep" />
        <Кнопка disabled={disabled} on={() => ch().toggleBold().run()} active={стан.bold} title="Жирний">
          <b>Ж</b>
        </Кнопка>
        <Кнопка disabled={disabled} on={() => ch().toggleItalic().run()} active={стан.italic} title="Курсив">
          <i>К</i>
        </Кнопка>
        <Кнопка disabled={disabled} on={посилання} active={стан.link} title="Посилання">
          Посилання
        </Кнопка>
        <span className="news-toolbar-sep" />
        <Кнопка disabled={disabled} on={() => ch().toggleBulletList().run()} active={стан.ul} title="Маркований список">
          • Список
        </Кнопка>
        <Кнопка disabled={disabled} on={() => ch().toggleOrderedList().run()} active={стан.ol} title="Нумерований список">
          1. Список
        </Кнопка>
        <Кнопка disabled={disabled} on={() => ch().toggleBlockquote().run()} active={стан.quote} title="Цитата">
          Цитата
        </Кнопка>
        <span className="news-toolbar-sep" />
        <Кнопка disabled={disabled} on={() => fileRef.current?.click()} title="Вставити фото">
          Фото
        </Кнопка>
        <Кнопка disabled={disabled} on={відео} title="Вставити відео YouTube">
          YouTube
        </Кнопка>
        {!стан.table ? (
          <Кнопка disabled={disabled} on={() => ch().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Вставити таблицю 3×3">
            Таблиця
          </Кнопка>
        ) : (
          <>
            <Кнопка disabled={disabled} on={() => ch().addRowAfter().run()} title="Додати рядок нижче">
              + рядок
            </Кнопка>
            <Кнопка disabled={disabled} on={() => ch().addColumnAfter().run()} title="Додати стовпець праворуч">
              + стовпець
            </Кнопка>
            <Кнопка disabled={disabled} on={() => ch().deleteRow().run()} title="Прибрати рядок">
              − рядок
            </Кнопка>
            <Кнопка disabled={disabled} on={() => ch().deleteColumn().run()} title="Прибрати стовпець">
              − стовпець
            </Кнопка>
            <Кнопка disabled={disabled} on={() => ch().deleteTable().run()} title="Прибрати таблицю">
              − таблиця
            </Кнопка>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) фото(f).catch((err) => window.alert(err.message || 'Фото не завантажилось'));
          }}
        />
      </div>
      <EditorContent editor={editor} className="news-editor-body" />
    </div>
  );
}
