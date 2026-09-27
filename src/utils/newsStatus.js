export const СТАТУСИ = { draft: 'чернетка', published: 'опублікована', archived: 'архів' };

// Опублікована з майбутньою датою — «відкладена»: на сайті її ще не видно
export const стан = (n) =>
  n.status === 'published' && Number(n.published_at) > Date.now() ? { key: 'scheduled', label: 'відкладена' } : { key: n.status, label: СТАТУСИ[n.status] || n.status };
