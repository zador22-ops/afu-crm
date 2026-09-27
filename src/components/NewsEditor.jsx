import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { TableKit } from '@tiptap/extension-table';
import { crm } from '../api/client.js';
import { Modal } from './ui.jsx';

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

// Замість window.prompt: вбудований браузер і частина вбудованих переглядачів
// блокують системні вікна, і prompt мовчки повертає null — кнопка «нічого не
// робить». Власне вікно працює скрізь.
function InputDialog({ dialog, onClose, onApply }) {
  const [value, setValue] = useState(dialog.value || '');
  const тексти = {
    link: { title: 'Посилання', label: 'Адреса', hint: 'Порожньо — прибрати посилання', placeholder: 'https://…' },
    video: { title: 'Відео YouTube', label: 'Посилання на відео', hint: 'Звичайне посилання з адресного рядка YouTube', placeholder: 'https://www.youtube.com/watch?v=…' },
    alt: { title: 'Опис фото', label: 'Що на фото', hint: 'Для людей з вадами зору; прочитає програма екранного доступу', placeholder: 'Гравці ХІТ святкують гол' },
  }[dialog.kind];
  const apply = () => onApply(value.trim());
  return (
    <Modal title={тексти.title} onClose={onClose} width={460}>
      <div className="form">
        <label className="field">
          <span className="field-label">{тексти.label}</span>
          <input
            autoFocus
            value={value}
            placeholder={тексти.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter не має відправляти всю форму новини
              if (e.key === 'Enter') {
                e.preventDefault();
                apply();
              }
            }}
          />
          <span className="field-hint">{тексти.hint}</span>
        </label>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Скасувати
          </button>
          <button type="button" className="btn primary" onClick={apply}>
            Готово
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function NewsEditor({ value, onChange, disabled }) {
  const fileRef = useRef(null);
  const [dialog, setDialog] = useState(null); // { kind: 'link' | 'video' | 'alt', value, img? }
  const [помилка, setПомилка] = useState('');
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

  const посилання = () => setDialog({ kind: 'link', value: editor.getAttributes('link').href || '' });
  const відео = () => setDialog({ kind: 'video', value: '' });
  const фото = async (file) => {
    setПомилка('');
    const form = new FormData();
    form.append('image', file);
    const img = await crm.upload('/news/images', form);
    setDialog({ kind: 'alt', value: '', img });
  };

  const застосувати = (text) => {
    const d = dialog;
    setDialog(null);
    if (d.kind === 'link') {
      if (!text) ch().extendMarkRange('link').unsetLink().run();
      else ch().extendMarkRange('link').setLink({ href: text }).run();
    } else if (d.kind === 'video') {
      if (text && !ch().setYoutubeVideo({ src: text }).run()) setПомилка('Це не схоже на посилання YouTube');
    } else if (d.kind === 'alt') {
      ch().setImage({ src: d.img.url, alt: text, width: d.img.meta?.width || null, height: d.img.meta?.height || null }).run();
    }
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
            if (f) фото(f).catch((err) => setПомилка(err.message || 'Фото не завантажилось'));
          }}
        />
      </div>
      {помилка && <div className="error-text news-editor-error">{помилка}</div>}
      <EditorContent editor={editor} className="news-editor-body" />
      {dialog && (
        <InputDialog
          dialog={dialog}
          onClose={() => {
            // Фото вже завантажене — вставляємо без опису, щоб воно не загубилось
            if (dialog.kind === 'alt') застосувати('');
            else setDialog(null);
          }}
          onApply={застосувати}
        />
      )}
    </div>
  );
}
