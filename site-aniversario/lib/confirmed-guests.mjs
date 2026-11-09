import { randomBytes, createHash } from 'node:crypto';

// Presenças informadas pela organizadora, sem depender do formulário público.
// Os identificadores fixos evitam duplicações nos próximos inícios do servidor.
const confirmedGuests = [
  ['family-tabata', 'Tábata', 'Anfitriã. Presença confirmada pela Tábata.'],
  ['family-gabriel', 'Gabriel', 'Marido da Tábata. Presença confirmada pela Tábata.'],
  ['family-marcelo', 'Marcelo', 'Pai da Tábata. Presença confirmada pela Tábata.'],
  ['family-patricia', 'Patrícia Macedo (mãe)', 'Mãe da Tábata. Presença confirmada pela Tábata.'],
  ['family-carlos-de-macedo-pai', 'Carlos de Macedo (pai)', 'Avô da Tábata; acompanha Maria. Presença confirmada pela Tábata.'],
  ['family-kalel', 'Kalel', 'Namorado da Ariane; acompanha Ariane. Presença confirmada pela Tábata.'],
  ['family-elza', 'Elza', 'Tia da Tábata. Presença confirmada pela Tábata.'],
  ['family-nenem', 'Neném', 'Tio da Tábata. Presença confirmada pela Tábata.'],
];

const elvisFamilyUpdate = 'elvis-silva-family-v1';
const elvisFamilyClarification = 'Complemento da Tábata: Elvis Silva vem com a esposa Joyce e a filha Pietra. São 3 pessoas, incluindo Elvis. As 2 acompanhantes já estão cadastradas individualmente e incluídas nos totais; não somar novamente.';
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
  ];
  for (const [id, name, relationship] of companions) {
    const editHash = createHash('sha256').update(randomBytes(32)).digest('hex');
    insert.run(id, editHash, name, `${relationship} Acompanha Elvis Silva. Presença confirmada pela Tábata.`, now, now);
  }
  const note = [elvis.note, elvisFamilyClarification].filter(Boolean).join('\n\n');
  db.prepare('UPDATE responses SET note = ?, updated_at = ? WHERE id = ?').run(note, now, elvis.id);
  db.prepare('INSERT INTO organizer_updates VALUES (?, ?)').run(elvisFamilyUpdate, now);
}

function removePietraBoyfriend(db, now) {
  const update = 'elvis-remove-pietra-boyfriend-v1';
  if (db.prepare('SELECT id FROM organizer_updates WHERE id = ?').get(update)) return;
  const matches = db.prepare('SELECT id, name, note FROM responses').all().filter((row) => normalizeName(row.name) === 'elvis silva');
  if (matches.length !== 1) return;
  const elvis = matches[0];
  const removedId = 'family-elvis-silva-namorado-pietra';
  db.prepare('DELETE FROM companion_overrides WHERE response_id = ?').run(removedId);
  db.prepare('DELETE FROM responses WHERE id = ?').run(removedId);
  const oldClarification = 'Complemento da Tábata: Elvis Silva vem com a esposa Joyce, a filha Pietra e o namorado da Pietra (nome ainda não informado). São 4 pessoas, incluindo Elvis. Os 3 acompanhantes já estão cadastrados individualmente e incluídos nos totais; não somar novamente.';
  const originalNote = elvis.note.replace(oldClarification, '').replace(elvisFamilyClarification, '').trim();
  const note = [originalNote, elvisFamilyClarification].filter(Boolean).join('\n\n');
  db.prepare('UPDATE responses SET note = ?, updated_at = ? WHERE id = ?').run(note, now, elvis.id);
  const override = db.prepare('SELECT companions, note_snapshot FROM companion_overrides WHERE response_id = ?').get(elvis.id);
  if (override) {
    const companions = JSON.parse(override.companions).filter((name) => normalizeName(name) !== 'namorado da pietra');
    db.prepare('UPDATE companion_overrides SET companions = ?, note_snapshot = ? WHERE response_id = ?')
      .run(JSON.stringify(companions), override.note_snapshot === elvis.note ? note : override.note_snapshot, elvis.id);
  }
  db.prepare('INSERT INTO organizer_updates VALUES (?, ?)').run(update, now);
}

function identifyPatricias(db, now) {
  const applied = db.prepare('SELECT id FROM organizer_updates WHERE id = ?');
  const mark = db.prepare('INSERT INTO organizer_updates VALUES (?, ?)');
  const motherUpdate = 'patricia-macedo-mother-v1';
  if (!applied.get(motherUpdate)) {
    db.prepare('UPDATE responses SET name = ?, updated_at = ? WHERE id = ?')
      .run('Patrícia Macedo (mãe)', now, 'family-patricia');
    mark.run(motherUpdate, now);
  }
  const auntUpdate = 'patricia-macedo-aunt-v1';
  if (!applied.get(auntUpdate)) {
    // Registro conferido no painel: é a tia, pessoa diferente da mãe.
    const aunt = db.prepare('SELECT id, note FROM responses WHERE id = ?').get('9094ecb0-a841-4bc8-b1d8-980ea36ec6a0');
    if (aunt) {
      const note = [aunt.note, 'Identificação pela Tábata: tia da Tábata, irmã do Marcelo (pai da Tábata).'].filter(Boolean).join('\n\n');
      db.prepare('UPDATE responses SET name = ?, note = ?, updated_at = ? WHERE id = ?')
        .run('Patrícia Macedo (tia)', note, now, aunt.id);
      // Conserva uma conferência existente: a inclusão do parentesco não muda acompanhantes.
      db.prepare('UPDATE companion_overrides SET note_snapshot = ? WHERE response_id = ? AND note_snapshot = ?')
        .run(note, aunt.id, aunt.note);
      mark.run(auntUpdate, now);
    }
  }
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
    removePietraBoyfriend(db, now);
    identifyPatricias(db, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
