import { useEffect, useRef, useState } from 'react';
import { ФОТО, описСтиснення, стиснутиФото } from './compressImage.js';

/**
 * Вибраний у формі файл зображення — одразу стиснутий.
 *
 * Стискаємо при виборі, а не при збереженні: людина бачить прев'ю вже того,
 * що піде на сервер, і підпис «6,8 МБ → 350 КБ». Поки стискаємо (на важкому
 * фото — частки секунди), `стискаємо` = true: кнопку збереження форма має
 * вимкнути, інакше встигне піти без фото.
 *
 *   const фото = useСтисненеФото();
 *   <input type="file" onChange={(e) => фото.вибрати(e.target.files?.[0] || null)} />
 *   {фото.прев && <img src={фото.прев} />}  {фото.опис}
 *   form.append('image', фото.file)
 */
export function useСтисненеФото(опції = ФОТО) {
  const [стан, setСтан] = useState({ file: null, прев: null, опис: null });
  const [стискаємо, setСтискаємо] = useState(false);
  const останній = useRef(0);

  useEffect(() => () => стан.прев && URL.revokeObjectURL(стан.прев), [стан.прев]);

  const вибрати = async (f) => {
    const мій = ++останній.current;
    if (!f) {
      setСтискаємо(false);
      setСтан({ file: null, прев: null, опис: null });
      return;
    }
    setСтискаємо(true);
    const r = await стиснутиФото(f, опції);
    // Поки стискали, людина могла вибрати інший файл — тоді цей уже не потрібен
    if (мій !== останній.current) return;
    setСтан({ file: r.file, прев: URL.createObjectURL(r.file), опис: описСтиснення(r) });
    setСтискаємо(false);
  };

  return { ...стан, стискаємо, вибрати, скинути: () => вибрати(null) };
}
