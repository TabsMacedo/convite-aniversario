import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCompanions, expandCompanions, peopleSummary } from '../lib/companions.mjs';

const guest = (id, name, note, status = 'yes') => ({ id, name, note, status, created_at: '2026-11-09T12:00:00.000Z', updated_at: '2026-11-09T12:00:00.000Z' });

test('recados com nomes, parentescos e quantidades viram pessoas individuais', () => {
  const notes = [
    ['Bruno vai comigo.', 1, false],
    ['Vai eu, meu esposo, a Laís e mais dois enteados.', 4, false],
    ['Meu esposo, a Laís e mais dois enteados.', 4, false],
    ['Vou com meus dois filhos.', 2, false],
    ['Vou com minha filha de 4 anos.', 1, false],
    ['Eu e o Bruno', 1, false],
    ['Somos cinco pessoas.', 4, false],
    ['Vou com minha família. Somos 5 pessoas.', 4, false],
    ['Vou com 3 pessoas.', 3, false],
    ['Vou com minha esposa Joyce e minha filha Pietra.', 2, false],
    ['Vou com minha família.', 0, true],
    ['Vou com meus filhos.', 0, true],
    ['Meu marido não vai comigo.', 0, true],
    ['Talvez meu marido vá comigo.', 0, true],
    ['Ela vai comigo.', 0, true],
    ['Vou com certeza!', 0, false],
    ['Vou levar carne e cerveja.', 0, false],
    ['Adorei o convite!', 0, false],
    ['o Bruno também vai', 1, false],
    ['Comigo vai o Adelino, e o seu tio Santo', 2, false],
    ['Confirmar presença de Ana Silva, de 7 aninhos e Roberto.', 2, false],
    ['Não só vou como pode contar comigo linda!\nCom relação ao kit churrasco diga o que deseja por favor !', 0, false],
  ];
  for (const [note, count, review] of notes) {
    const result = parseCompanions(note);
    assert.equal(result.people.length, count, note);
    assert.equal(result.needs_review, review, note);
  }
  const rows = expandCompanions([guest('stephanie', 'Stephanie', 'Vai eu, meu esposo, a Laís e mais dois enteados.')]);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].group_size, 5);
  assert.equal(rows.filter((row) => row.name.includes('Enteado')).length, 2);
  assert.ok(rows.some((row) => row.name === 'Laís'));
  assert.ok(rows.slice(1).every((row) => row.parent_id === 'stephanie' && row.status === 'yes' && row.note.includes('Stephanie')));
});

test('familiares já cadastrados não são duplicados e respostas mudam a projeção sem acumular pessoas', () => {
  const ariane = guest('ariane', 'Ariane Silva', 'Vou com meu namorado e dois filhos.');
  const kalel = guest('family-kalel', 'Kalel', 'Namorado da Ariane.');
  const rows = expandCompanions([ariane, kalel]);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].group_size, 4);
  assert.deepEqual(rows[0].registered_companions, ['Kalel']);
  assert.equal(rows.filter((row) => row.name === 'Kalel').length, 1);
  assert.equal(expandCompanions([{ ...ariane, note: 'Vou sozinha.' }, kalel]).length, 2);
  const maybe = expandCompanions([guest('test', 'Teste', 'Bruno vai comigo.', 'maybe')]);
  assert.deepEqual(peopleSummary(maybe), { yes: 0, maybe: 2, no: 0, total: 2, needs_review: 0 });
});

test('possíveis duplicações e recados vagos ficam sinalizados sem inventar pessoas', () => {
  const rows = expandCompanions([guest('sarah', 'Sarah', 'Bruno vai comigo.'), guest('bruno', 'Bruno Silva', '')]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].needs_review, true);
  assert.match(rows[0].review_reason, /Bruno/);
  const shared = expandCompanions([guest('sarah', 'Sarah', 'Bruno vai comigo.'), guest('pamela', 'Pamela', 'Vou com Bruno.')]);
  assert.equal(shared.length, 2);
  assert.ok(shared.every((row) => row.needs_review));
  const family = expandCompanions([guest('test', 'Teste', 'Vou com minha família.')]);
  assert.equal(family.length, 1);
  assert.equal(family[0].needs_review, true);
  const alreadyConfirmed = expandCompanions([
    guest('carlos', 'Carlos', 'A Júlia ferracin minha namorada vai estar junto, ela já confirmou. Muito obrigado!'),
    guest('julia', 'Júlia Oliveira Ferracin', ''),
  ]);
  assert.equal(alreadyConfirmed.length, 2);
  assert.equal(alreadyConfirmed[0].group_size, 2);
  assert.equal(alreadyConfirmed[0].needs_review, false);
  assert.deepEqual(alreadyConfirmed[0].registered_companions, ['Júlia Oliveira Ferracin']);
});

test('conferência manual define acompanhantes e uma mudança no recado pede nova conferência', () => {
  const owner = guest('test', 'Teste', 'Vou com minha família.');
  const override = { response_id: 'test', companions: JSON.stringify(['Esposo', 'Laís', 'Enteado 1', 'Enteado 2']), note_snapshot: owner.note };
  const rows = expandCompanions([owner], [override]);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].needs_review, false);
  assert.equal(rows[0].reviewed, true);
  const updated = expandCompanions([{ ...owner, note: 'Agora vou sozinha.' }], [override]);
  assert.equal(updated[0].needs_review, true);
  assert.match(updated[0].review_reason, /mudou/);
});
