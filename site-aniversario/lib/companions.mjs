const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/gu, ' ');
const numbers = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
const numberPattern = '(\\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';
const numberValue = (value) => numbers[value] ?? Number(value);
const relationship = /\b(espos[oa]|marido|mulher|conjuge|namorad[oa]|companheir[oa]|filh[oa]s?|entead[oa]s?|criancas?|amig[oa]s?|irma[os]?|irmas?|mae|pai|avo|ti[oa])\b/u;
const kindOf = (word) => /espos|marido|mulher|conjuge|namorad|companheir/u.test(word) ? 'partner' : /entead/u.test(word) ? 'stepchild' : /filh|crianc/u.test(word) ? 'child' : 'relative';
const genericName = { partner: 'Cônjuge ou companheiro(a)', stepchild: 'Enteado(a)', child: 'Filho(a) ou criança', relative: 'Acompanhante' };

// Leitura local e conservadora: recados vagos ou condicionais ficam para revisão.
export function parseCompanions(note) {
  const original = note.normalize('NFC').split(/Complemento da Tábata:/u)[0].trim();
  const text = normalize(original);
  const contextText = text.replace(/\b(?:pode contar|conte|conta) comigo\b/gu, '');
  const context = /\b(comigo|conosco|familia|espos[oa]|marido|conjuge|namorad[oa]|filh[oa]s?|entead[oa]s?|acompanhantes?|pessoas|vou com|vamos com|eu e)\b/u.test(contextText);
  if (!text) return { people: [], needs_review: false };
  if (/\b(nao|talvez|depende|se der|se puder|se for)\b/u.test(text) && (context || /\bcom\s+\p{L}+/u.test(text) && !/\bpode contar comigo\b/u.test(text))) return { people: [], needs_review: true };
  let total;
  const totalMatch = text.match(new RegExp(`\\b(?:somos|seremos|total(?: de)?|ao todo(?: somos| seremos)?)\\s+${numberPattern}(?:\\s+pessoas)?\\b`, 'u'));
  if (totalMatch) total = numberValue(totalMatch[1]);
  let fragment = original;
  const withMe = text.match(/\b(?:vai|vao|ira|irao|vem|virao)\s+(?:junto\s+)?(?:comigo|conosco)\b/u);
  const alsoGoes = text.match(/\s+(?:tambem\s+)?(?:vai|vao|vem|irao)(?:\s+estar)?(?:\s+junt[oa]s?)?\s*(?:[,!.]|$)/u);
  if (withMe) fragment = original.slice(0, withMe.index);
  else if (alsoGoes) fragment = original.slice(0, alsoGoes.index);
  else {
    const start = text.match(/\b(?:com|levar|levo)\s+|\beu\s*(?:,|e\s)|^comigo\s+(?:vai|vao|vem)\s+|\bconfirmar presenca de\s+/u);
    if (start) fragment = original.slice(start.index + start[0].length);
    else if (!/^(?:(?:vai\s+|vou\s+)?eu\b|meu\b|minha\b|meus\b|minhas\b)/u.test(text)) {
      return total ? { people: Array.from({ length: Math.min(40, Math.max(0, total - 1)) }, () => ({ name: 'Acompanhante', kind: 'unknown', named: false })), needs_review: total > 41 } : { people: [], needs_review: context };
    }
  }
  fragment = fragment.split(/[.!?\n]/u)[0];
  const parts = fragment.split(/\s*(?:,|;|\+|\be\b|\bmais\b)\s*/iu).filter(Boolean);
  const people = [];
  let needsReview = false;
  for (let part of parts) {
    part = part.trim().replace(/^(?:(?:vou|vai|vamos)\s+)?eu\s*$/iu, '')
      .replace(/^(?:(?:a|o|os|as|meu|minha|meus|minhas|seu|sua|seus|suas)\s+)+/iu, '').trim();
    if (!part) continue;
    const clean = normalize(part);
    if (/\b(carne|bebida|cerveja|refrigerante|certeza|carinho|presente|churrasco|alegria|gratidao|obrigad[oa])\b/u.test(clean) || /^(?:de )?\d+\s+(?:anos|aninhos|meses)\b/u.test(clean)) continue;
    if (/^(?:familia|pessoal|todos|outros|alguns|algumas|ela|ele|elas|eles|vcs|voce|voces)\b/u.test(clean)) { needsReview = true; continue; }
    const role = clean.match(relationship);
    const countMatch = clean.match(new RegExp(`^${numberPattern}\\s+(?:meus? |minhas? )?`, 'u'))
      || clean.match(new RegExp(`^(?:meus?|minhas?)\\s+${numberPattern}\\s+`, 'u'));
    const count = countMatch ? numberValue(countMatch[1]) : 1;
    if (role) {
      const kind = kindOf(role[1]);
      if (/s$/u.test(role[1]) && !countMatch) { needsReview = true; continue; }
      const afterRole = part.slice(role.index + role[0].length).trim().replace(/^(?:chamad[oa]|que se chama)\s+/iu, '');
      const beforeRole = part.slice(0, role.index).trim().replace(/\s+(?:meu|minha|seu|sua)$/iu, '');
      const candidate = afterRole || (/^\p{Lu}/u.test(beforeRole) ? beforeRole : '');
      const named = count === 1 && /^[\p{L}][\p{L}' -]{1,79}$/u.test(candidate) && !/^(?:a |o |com|que|vai|vem|tambem|junto|dela|dele|de |do |da )/u.test(normalize(candidate));
      if (afterRole && !named && !/^(?:de |do |da )/u.test(normalize(afterRole))) needsReview = true;
      for (let i = 0; i < Math.min(count, 40); i++) people.push({ name: named ? candidate : genericName[kind], kind, named: Boolean(named) });
      if (count > 40) needsReview = true;
    } else if (countMatch && /\b(?:pessoas|acompanhantes)\b/u.test(clean)) {
      for (let i = 0; i < Math.min(count, 40); i++) people.push({ name: 'Acompanhante', kind: 'unknown', named: false });
      if (count > 40) needsReview = true;
    } else if (/^[\p{L}][\p{L}' -]{1,79}$/u.test(part) && !/\b(carne|bebida|cerveja|refrigerante|certeza|carinho|presente|churrasco|muita|muito|alegria|voce|voces|gratidao|obrigad[oa])\b/u.test(clean)) {
      if (part.split(/\s+/u).length <= 4 && (/^\p{Lu}/u.test(part) || withMe || /\bcom\b/u.test(text))) people.push({ name: part, kind: 'named', named: true });
      else needsReview = true;
    } else if (context) needsReview = true;
  }
  if (total !== undefined) {
    if (total < 1 || total > 41 || people.length > total - 1) needsReview = true;
    else {
      while (people.length < total - 1) people.push({ name: 'Acompanhante', kind: 'unknown', named: false });
      needsReview = false;
    }
  }
  const named = new Set();
  const unique = people.filter((person) => {
    if (!person.named) return true;
    const key = normalize(person.name);
    if (named.has(key)) return false;
    named.add(key);
    return true;
  });
  return { people: unique.slice(0, 40), needs_review: needsReview || unique.length > 40 };
}

const fixedLinks = [
  ['family-carlos-de-macedo-pai', 'Maria', 'relative'],
  ['family-kalel', 'Ariane', 'partner'],
  ['family-elvis-silva-joyce', 'Elvis Silva', 'partner'],
  ['family-elvis-silva-pietra', 'Elvis Silva', 'child'],
];

export function expandCompanions(responses, overrides = []) {
  const overrideMap = new Map(overrides.map((row) => [row.response_id, row]));
  const known = new Map();
  const linked = new Map();
  for (const [id, parentName, kind] of fixedLinks) {
    const child = responses.find((row) => row.id === id);
    const parents = responses.filter((row) => !row.id.startsWith('family-') && (normalize(row.name) === normalize(parentName)
      || !parentName.includes(' ') && normalize(row.name).split(' ')[0] === normalize(parentName)));
    if (child && parents.length === 1) {
      const parent = parents[0];
      known.set(parent.id, [...(known.get(parent.id) || []), { ...child, kind }]);
      linked.set(child.id, parent);
    }
  }
  const result = [];
  for (const row of responses) {
    if (row.id.startsWith('family-') && !overrideMap.has(row.id)) {
      result.push({ ...row, is_companion: linked.has(row.id), parent_id: linked.get(row.id)?.id });
      continue;
    }
    const existing = known.get(row.id) || [];
    const referenced = [];
    const override = overrideMap.get(row.id);
    const parsed = parseCompanions(row.note);
    let people = parsed.people;
    let review = parsed.needs_review;
    let reason = review ? 'O recado não deixa a quantidade ou a presença de todos clara.' : '';
    if (override) {
      people = JSON.parse(override.companions).map((name) => ({ name, kind: 'manual', named: true }));
      review = override.note_snapshot !== row.note;
      reason = review ? 'O recado mudou depois da sua conferência. Confira os acompanhantes novamente.' : '';
    } else {
      const remainingKnown = [...existing];
      const additional = [];
      // Primeiro reconhece nomes; depois usa as relações para não repetir familiares já cadastrados.
      for (const person of [...people.filter((p) => p.named), ...people.filter((p) => !p.named)]) {
        const match = remainingKnown.findIndex((child) => person.named
          ? normalize(child.name) === normalize(person.name) || normalize(child.name).split(' ')[0] === normalize(person.name)
          : person.kind === child.kind || person.kind === 'unknown');
        if (match >= 0) remainingKnown.splice(match, 1);
        else additional.push(person);
      }
      people = additional;
      const guestNote = normalize(row.note.split('Complemento da Tábata:')[0]);
      if (existing.length && parsed.people.length === 0 && /\bfamilia\b/u.test(guestNote) && !/\b(nao|talvez|depende)\b/u.test(guestNote)) {
        review = false;
        reason = '';
      }
      people = people.filter((person) => {
        if (!person.named) return true;
        const tokens = normalize(person.name).split(' ');
        const possible = responses.filter((other) => other.id !== row.id && !existing.some((child) => child.id === other.id)
          && (normalize(other.name) === normalize(person.name) || normalize(other.name).split(' ')[0] === normalize(person.name)
            || tokens.length >= 2 && tokens[0] === normalize(other.name).split(' ')[0] && tokens.every((word) => normalize(other.name).split(' ').includes(word))));
        if (!possible.length) return true;
        if (possible.length === 1 && /\bja (?:confirmou|esta na lista)\b/u.test(normalize(row.note))) {
          referenced.push(possible[0]);
          return false;
        }
        review = true;
        reason = `${person.name} pode já ter um registro na lista. Confira antes de somar novamente.`;
        return false;
      });
    }
    const companions = people.map((person, index) => ({
      id: `companion:${row.id}:${index + 1}`, name: person.named ? person.name : `${person.name} ${index + 1} de ${row.name}`,
      status: row.status, note: `Acompanha ${row.name}. ${override ? 'Conferido pela Tábata.' : 'Identificado na observação; confira os nomes e a quantidade.'}`,
      created_at: row.created_at, updated_at: row.updated_at, is_companion: true, parent_id: row.id, automatic: !override, inferred_named: person.named,
    }));
    result.push({ ...row, group_size: 1 + existing.length + referenced.length + companions.length, additional_companions: companions.map((p) => p.name),
      registered_companions: [...existing, ...referenced].map((p) => p.name), needs_review: review, review_reason: reason, reviewed: Boolean(override) });
    result.push(...companions);
  }
  const mentions = new Map();
  for (const row of result.filter((person) => person.automatic && person.inferred_named)) {
    const key = normalize(row.name);
    mentions.set(key, [...(mentions.get(key) || []), row]);
  }
  const disputed = new Set();
  for (const people of mentions.values()) {
    if (people.length < 2) continue;
    for (const person of people) {
      disputed.add(person.id);
      const parent = result.find((row) => row.id === person.parent_id);
      parent.needs_review = true;
      parent.review_reason = `${person.name} foi citado em mais de um grupo. Confira onde contar essa pessoa.`;
      parent.group_size--;
      parent.additional_companions = parent.additional_companions.filter((name) => name !== person.name);
    }
  }
  return result.filter((row) => !disputed.has(row.id));
}

export function peopleSummary(responses) {
  const totals = { yes: 0, maybe: 0, no: 0, total: responses.length, needs_review: 0 };
  for (const row of responses) {
    totals[row.status]++;
    if (row.needs_review) totals.needs_review++;
  }
  return totals;
}
