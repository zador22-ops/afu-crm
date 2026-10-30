import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Лямбди 3.3 (штаб клубу) з самих .xs ($var / $input → фікстури, фіксоване «зараз»)
const лямбда = (файл, ім) => {
  const xs = fs.readFileSync(new URL(`../../xano/crm/${файл}`, import.meta.url), 'utf8');
  const кінець = xs.indexOf(`} as $${ім}`);
  const код = xs.slice(xs.lastIndexOf('api.lambda {', кінець), кінець).match(/code = """([\s\S]*?)"""/)[1];
  const f = new Function('ЗМІННІ_', 'ВХІД_', код.replace(/\$var\./g, 'ЗМІННІ_.').replace(/\$input\./g, 'ВХІД_.'));
  return (з, в) => {
    const справжній = Date.now;
    Date.now = () => ЗАРАЗ;
    try {
      return f(з, в);
    } finally {
      Date.now = справжній;
    }
  };
};
const ЗАРАЗ = Date.UTC(2026, 9, 30, 12, 0);
const помилки = (r) => Object.entries(r).filter(([k, v]) => k.endsWith('_ok') && !v).map(([k]) => k);
const ПОСАДИ = [
  { id: 1, Position: 'Універсал', Player_position: true },
  { id: 4, Position: 'Головний тренер', Player_position: false },
  { id: 5, Position: 'Лікар', Player_position: false },
];
const ЛЮДИ = [
  { id: 1, prizvushche: 'Тренерко', Name: 'Олег', Date_of_birth: '1980-01-01' },
  { id: 2, prizvushche: 'Лікаренко', Name: 'Ніна', Date_of_birth: '1985-02-02' },
];

test('штаб: чинні рядки, лише посади штабу; нові з заявок', () => {
  const штаб = лямбда('club-clubs-id-staff.get.xs', 'staff');
  const r = штаб({
    rows: [
      { id: 10, people_id: 1, positions_id: 4, Relevance_of_the_record: true },
      { id: 11, people_id: 2, positions_id: 5, Relevance_of_the_record: false }, // виведено
    ],
    people: ЛЮДИ,
    positions: ПОСАДИ,
    requests: [
      { id: 50, entity: 'person', action: 'create', after: { prizvushche: 'Новенко', Name: 'Іра' }, status: 'draft' },
      { id: 51, entity: 'staff_row', action: 'create', depends_on_id: 50, after: { positions_id: 5 }, status: 'draft' },
      { id: 52, entity: 'staff_row', action: 'update', entity_id: 10, after: { positions_id: 5 }, status: 'submitted' },
    ],
  });
  assert.deepEqual(r.positions, [{ id: 4, name: 'Головний тренер' }, { id: 5, name: 'Лікар' }]);
  assert.deepEqual(r.staff.map((s) => [s.id, s.name, s.position, s.request && s.request.status]), [[10, 'Тренерко Олег', 'Головний тренер', 'submitted']]);
  assert.deepEqual(r.pending.map((p) => [p.request_id, p.name, p.new_person, p.position]), [[51, 'Новенко Іра', true, 'Лікар']]);
});

const додати = (person, positions_id, з = {}) =>
  лямбда('club-clubs-id-staff.post.xs', 'plan')({ rows: [{ id: 10, people_id: 1, positions_id: 4 }], people: ЛЮДИ, positions: ПОСАДИ, open: [], ...з }, { teaminfo_id: 20, person, positions_id });

test('додати до штабу: наявна чи нова особа; лише посада штабу; без дубля', () => {
  const r = додати({ people_id: 2 }, 5);
  assert.deepEqual(помилки(r), []);
  assert.deepEqual(r.after, { positions_id: 5 });
  assert.deepEqual(помилки(додати({ people_id: 2 }, 1)), ['position_ok']); // ігрова позиція
  assert.deepEqual(помилки(додати({ people_id: 1 }, 4)), ['already_ok']); // уже головний тренер
  assert.deepEqual(помилки(додати({ people_id: 1 }, 5)), []); // друга посада — можна
  assert.deepEqual(помилки(додати({ people_id: 2 }, 5, { open: [{ action: 'create', people_id: 2, after: { positions_id: 5 } }] })), ['already_ok']);
  const н = додати({ new: { prizvushche: 'Новенко', Name: 'Іра', Date_of_birth: '1990-03-03' } }, 5);
  assert.deepEqual(помилки(н), []);
  assert.deepEqual(н.person_after, { prizvushche: 'Новенко', Name: 'Іра', Date_of_birth: '1990-03-03' });
  assert.deepEqual(помилки(додати({ new: { prizvushche: 'тренерко', Name: 'Х', Date_of_birth: '1980-01-01' } }, 5)), ['dup_ok']);
});

test('вивести зі штабу: чинний рядок, дата не в майбутньому й не раніше призначення; ключ staff:<id>', () => {
  const вивести = лямбда('club-clubs-id-staff-id-remove.post.xs', 'plan');
  const r = { id: 10, Relevance_of_the_record: true, end_date: null, Date: '2026-09-01' };
  assert.deepEqual(вивести({ row: r }, { end_date: '2026-10-30' }), { active: true, date_ok: true, end_date: '2026-10-30', key: 'staff:10' });
  assert.equal(вивести({ row: r }, { end_date: '2026-10-31' }).date_ok, false);
  assert.equal(вивести({ row: r }, { end_date: '2026-08-31' }).date_ok, false);
  assert.equal(вивести({ row: { ...r, Relevance_of_the_record: false } }, { end_date: '2026-10-30' }).active, false);
});

test('змінити штаб: лише змінене; посада штабу без дубля; особа — як у гравця', () => {
  const змінити = (з, в) =>
    лямбда('club-clubs-id-staff-id.put.xs', 'plan')(
      { row: { id: 10, people_id: 1, positions_id: 4 }, person: { ...ЛЮДИ[0], City: 'Київ' }, positions: ПОСАДИ, same_person: [{ id: 10, positions_id: 4 }], ...з },
      { teaminfo_id: 20, staff_id: 10, ...в }
    );
  const r = змінити({}, { positions_id: 5, person: { City: 'Львів', Name: 'Олег' } });
  assert.deepEqual(помилки(r), []);
  assert.deepEqual(r.staff_after, { positions_id: 5 });
  assert.deepEqual(r.person_after, { City: 'Львів' });
  assert.equal(r.staff_key, 'staff:10');
  assert.equal(r.person_key, 'person:1');
  assert.equal(змінити({}, { positions_id: 4 }).staff_empty, true);
  assert.deepEqual(помилки(змінити({}, { positions_id: 1 })), ['position_ok']);
  assert.deepEqual(помилки(змінити({ same_person: [{ id: 10, positions_id: 4 }, { id: 12, positions_id: 5 }] }, { positions_id: 5 })), ['dup_ok']);
  assert.deepEqual(помилки(змінити({}, { person: { Name: '' } })), ['name_ok']);
});

test('«лише свої особи» в штабі: People читається після перевірки рядка свого клубу', () => {
  const s = fs.readFileSync(new URL('../../xano/crm/club-clubs-id-staff-id.put.xs', import.meta.url), 'utf8');
  const сторож = s.indexOf('precondition ($row != null && $row.teaminfo_id == $input.teaminfo_id && $row.Relevance_of_the_record != false)');
  assert.ok(сторож > 0);
  assert.ok(s.indexOf('db.get People') > сторож);
  assert.match(s, /if \(\$plan\.staff_empty && \$own_staff\)/);
  // відкритих полів null-змінної у виразах XanoScript немає
  for (const ф of ['club-clubs-id-staff.post.xs', 'club-clubs-id-players.post.xs']) assert.doesNotMatch(fs.readFileSync(new URL(`../../xano/crm/${ф}`, import.meta.url), 'utf8'), /\$person_request\.id/, ф);
});

test('форма «Змінити» в штабі: особа з чернеткою; посада — з відкритої зміни', async () => {
  const { формаШтабу } = await import('./clubStaff.js');
  const з = { id: 10, positions_id: 4, prizvushche: 'Тренерко', Name: 'Олег', Date_of_birth: '1980-01-01', photo: null, person_request: { after: { City: 'Львів' } } };
  assert.deepEqual(формаШтабу(з), {
    person: { prizvushche: 'Тренерко', Name: 'Олег', po_batkovi: '', Date_of_birth: '1980-01-01', City: 'Львів', Growth: '', Weight: '', Photo: null },
    positions_id: '4',
  });
  assert.equal(формаШтабу({ ...з, request: { action: 'update', after: { positions_id: 5 } } }).positions_id, '5');
  assert.equal(формаШтабу({ ...з, request: { action: 'remove', after: { end_date: '2026-10-30' } } }).positions_id, '4');
});
