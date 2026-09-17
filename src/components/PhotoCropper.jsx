import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './ui.jsx';

/**
 * Кадрування фото — як у соцмережах: кругле вікно, перетягування, зум.
 *
 * НАВІЩО ЦЕ ВЗАГАЛІ. Фото людей приходять довільних пропорцій (у базі є і
 * 408×612, і 2830×4164). Застосунок показує їх у круглому аватарі, тобто
 * обрізає по центру — і в портретному знімку туди часто потрапляє не обличчя,
 * а груди. Тому кадр вибирає людина, а зберігаємо квадрат: із квадрата будь-яке
 * коло вирізається без несподіванок.
 *
 * Уже завантажене фото теж можна перекадрувати: Xano віддає файли з CORS, тож
 * канвас не «отруюється» і експорт працює. Але беремо ми його через fetch у
 * blob, а не через `img.src = url` — так надійніше й не залежить від
 * `crossOrigin` на теґу.
 *
 * Пропси:
 *   file    File    щойно вибраний файл, або
 *   url     string  адреса вже збереженого фото
 *   size    number  сторона квадрата на виході, за замовчуванням 600
 *   onDone  (Blob, string) => void   готовий кадр і його objectURL для прев'ю
 */
const ВІКНО = 320;

export default function PhotoCropper({ file, url, size = 600, onClose, onDone }) {
  const [img, setImg] = useState(null);
  const [помилка, setПомилка] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [зсув, setЗсув] = useState({ x: 0, y: 0 });
  const тягнемо = useRef(null);
  const рамка = useRef(null);

  useEffect(() => {
    let живий = true;
    let objectUrl = null;
    (async () => {
      try {
        const blob = file || (await (await fetch(url)).blob());
        objectUrl = URL.createObjectURL(blob);
        // Саме onload, а не img.decode(): для зображення, якого немає в
        // документі, decode() у частині браузерів просто не повертається —
        // обіцянка висить, і вікно назавжди лишається в «Завантаження…».
        const i = await new Promise((готово, зле) => {
          const x = new Image();
          x.onload = () => готово(x);
          x.onerror = () => зле(new Error('не вдалося прочитати зображення'));
          x.src = objectUrl;
        });
        if (живий) setImg(i);
      } catch (e) {
        if (живий) setПомилка(e);
      }
    })();
    return () => {
      живий = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, url]);

  // Масштаб, за якого зображення повністю закриває вікно: менше не дозволяємо,
  // інакше в кадрі зʼявляться порожні кути.
  const база = img ? Math.max(ВІКНО / img.naturalWidth, ВІКНО / img.naturalHeight) : 1;
  const s = база * zoom;
  const ширина = img ? img.naturalWidth * s : 0;
  const висота = img ? img.naturalHeight * s : 0;

  const обмежити = useCallback(
    (з) => ({
      x: Math.min(0, Math.max(ВІКНО - ширина, з.x)),
      y: Math.min(0, Math.max(ВІКНО - висота, з.y)),
    }),
    [ширина, висота]
  );

  useEffect(() => setЗсув((з) => обмежити(з)), [обмежити]);

  // Центруємо, коли зображення щойно завантажилось або змінився зум
  useEffect(() => {
    if (img) setЗсув(обмежити({ x: (ВІКНО - ширина) / 2, y: (ВІКНО - висота) / 2 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);

  const почати = (e) => {
    const t = e.touches?.[0] || e;
    тягнемо.current = { x: t.clientX - зсув.x, y: t.clientY - зсув.y };
  };
  const рухати = (e) => {
    if (!тягнемо.current) return;
    const t = e.touches?.[0] || e;
    setЗсув(обмежити({ x: t.clientX - тягнемо.current.x, y: t.clientY - тягнемо.current.y }));
  };
  const відпустити = () => {
    тягнемо.current = null;
  };

  const клавіші = (e) => {
    const крок = e.shiftKey ? 20 : 4;
    const мапа = { ArrowLeft: [-крок, 0], ArrowRight: [крок, 0], ArrowUp: [0, -крок], ArrowDown: [0, крок] };
    const д = мапа[e.key];
    if (!д) return;
    e.preventDefault();
    setЗсув((з) => обмежити({ x: з.x + д[0], y: з.y + д[1] }));
  };

  const зберегти = async () => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    // Біле тло: JPEG не має прозорості, а PNG з прозорим фоном у круглому
    // аватарі дає сірі кути на світлих поверхнях.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    const k = size / ВІКНО;
    ctx.drawImage(img, зсув.x * k, зсув.y * k, ширина * k, висота * k);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    onDone(blob, URL.createObjectURL(blob));
  };

  return (
    <Modal title="Кадрувати фото" onClose={onClose} width={420}>
      {помилка && <div className="error-box">Не вдалося відкрити зображення</div>}
      {!img && !помилка && <div className="muted">Завантаження…</div>}
      {img && (
        <div className="cropper" onKeyDown={клавіші} tabIndex={0} ref={рамка}>
          <div
            className="crop-window"
            onMouseDown={почати}
            onMouseMove={рухати}
            onMouseUp={відпустити}
            onMouseLeave={відпустити}
            onTouchStart={почати}
            onTouchMove={рухати}
            onTouchEnd={відпустити}
          >
            <img
              src={img.src}
              alt=""
              draggable={false}
              style={{ width: ширина, height: висота, transform: `translate(${зсув.x}px, ${зсув.y}px)` }}
            />
          </div>
          <p className="muted small-text">Тягніть, щоб посунути. Стрілками — точніше, з Shift — швидше</p>
          <div className="crop-zoom">
            <button type="button" className="btn small" onClick={() => setZoom((z) => Math.max(1, z - 0.1))}>
              −
            </button>
            <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            <button type="button" className="btn small" onClick={() => setZoom((z) => Math.min(4, z + 0.1))}>
              +
            </button>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={onClose}>
              Скасувати
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setZoom(1);
                setЗсув(обмежити({ x: (ВІКНО - ширина) / 2, y: (ВІКНО - висота) / 2 }));
              }}
            >
              Скинути
            </button>
            <button type="button" className="btn primary" onClick={зберегти}>
              Зберегти кадр
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
