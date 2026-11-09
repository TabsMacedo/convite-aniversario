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
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
