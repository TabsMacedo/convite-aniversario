import { randomBytes, createHash } from 'node:crypto';

// Presenças informadas pela organizadora, sem depender do formulário público.
// Os identificadores fixos evitam duplicações nos próximos inícios do servidor.
const confirmedGuests = [
  ['family-tabata', 'Tábata', 'Anfitriã. Presença confirmada pela Tábata.'],
  ['family-gabriel', 'Gabriel', 'Marido da Tábata. Presença confirmada pela Tábata.'],
  ['family-marcelo', 'Marcelo', 'Pai da Tábata. Presença confirmada pela Tábata.'],
  ['family-patricia', 'Patrícia', 'Mãe da Tábata. Presença confirmada pela Tábata.'],
  ['family-carlos-de-macedo-pai', 'Carlos de Macedo (pai)', 'Avô da Tábata; acompanha Maria. Presença confirmada pela Tábata.'],
  ['family-kalel', 'Kalel', 'Namorado da Ariane; acompanha Ariane. Presença confirmada pela Tábata.'],
  ['family-elza', 'Elza', 'Tia da Tábata. Presença confirmada pela Tábata.'],
  ['family-nenem', 'Neném', 'Tio da Tábata. Presença confirmada pela Tábata.'],
];

const elvisFamilyUpdate = 'elvis-silva-family-v1';
const normalizeName = (value) => value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');

function registerElvisFamily(db, insert, now) {
  db.exec('CREATE TABLE IF NOT EXISTS organizer_updates (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  if (db.prepare('SELECT id FROM organizer_updates WHERE id = ?').get(elvisFamilyUpdate)) return;
  const matches = db.prepare('SELECT id, name, note FROM responses').all()
    .filter((row) => normalizeName(row.name) === 'elvis silva');
  // Nomes parecidos ou homônimos precisam ser conferidos antes de alterar uma resposta.
  if (matches.length !== 1) return;
  const elvis = matches[0];
  const companions = [
    ['family-elvis-silva-joyce', 'Joyce', 'Esposa do Elvis Silva.'],
    ['family-elvis-silva-pietra', 'Pietra', 'Filha do Elvis Silva.'],
    ['family-elvis-silva-namorado-pietra', 'Namorado da Pietra', 'Namorado da Pietra, filha do Elvis Silva. Nome ainda não informado.'],
  ];
  for (const [id, name, relationship] of companions) {
    const editHash = createHash('sha256').update(randomBytes(32)).digest('hex');
    insert.run(id, editHash, name, `${relationship} Acompanha Elvis Silva. Presença confirmada pela Tábata.`, now, now);
  }
  const clarification = 'Complemento da Tábata: Elvis Silva vem com a esposa Joyce, a filha Pietra e o namorado da Pietra (nome ainda não informado). São 4 pessoas, incluindo Elvis. Os 3 acompanhantes já estão cadastrados individualmente e incluídos nos totais; não somar novamente.';
  const note = [elvis.note, clarification].filter(Boolean).join('\n\n');
  db.prepare('UPDATE responses SET note = ?, updated_at = ? WHERE id = ?').run(note, now, elvis.id);
  db.prepare('INSERT INTO organizer_updates VALUES (?, ?)').run(elvisFamilyUpdate, now);
}

export function registerConfirmedGuests(db) {
  const insert = db.prepare(`INSERT INTO responses (id, edit_hash, name, status, note, created_at, updated_at)
    VALUES (?, ?, ?, 'yes', ?, ?, ?) ON CONFLICT(id) DO NOTHING`);
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [id, name, note] of confirmedGuests) {
      const editHash = createHash('sha256').update(randomBytes(32)).digest('hex');
      insert.run(id, editHash, name, note, now, now);
    }
    registerElvisFamily(db, insert, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
