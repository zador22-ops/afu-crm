// Вкладка «Штаб» кабінету клубу (самообслуговування клубів, 3.3)
import { формаОсоби } from './clubSquad.js';

/** Початкові значення «Змінити» в штабі: дані особи (з чернеткою) і посада (з відкритою зміною посади). */
export function формаШтабу(запис) {
  const r = запис.request;
  const посада = r && r.action === 'update' && r.after?.positions_id ? r.after.positions_id : запис.positions_id;
  return { person: формаОсоби(запис), positions_id: посада == null ? '' : String(посада) };
}
