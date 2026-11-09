// DOCX é um pacote ZIP com documentos XML. Sem dependências no navegador ou servidor.
const escapeXml = (value) => String(value ?? '')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/gu, '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const local = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const [path, value] of Object.entries(files)) {
    const name = Buffer.from(path), data = Buffer.from(value, 'utf8');
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); // 01/01/1980, data mínima do formato ZIP.
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, name);
    directorySize += entry.length + name.length;
    offset += header.length + name.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directory.length / 2, 8);
  end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...directory, end]);
}

const paragraph = (text, bold = false) => `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}${String(text).split(/\r?\n/).map((line, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join('')}</w:r></w:p>`;
const labels = { yes: 'Vou', maybe: 'Talvez', no: 'Não vou' };
const date = (value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));

export function createGuestDocx(responses, now = new Date()) {
  const totals = { yes: 0, maybe: 0, no: 0 };
  for (const response of responses) totals[response.status]++;
  const rows = [
    ['Nome', 'Resposta', 'Observação', 'Atualização'],
    ...responses.map((r) => [r.name, labels[r.status], r.note || '—', date(r.updated_at)]),
  ];
  if (!responses.length) rows.push(['Nenhuma presença registrada.', '—', '—', '—']);
  const widths = [2350, 1100, 4000, 1850];
  const table = `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="CBD5E1"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.map((row, index) => `<w:tr>${index === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${row.map((cell, column) => `<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/>${index === 0 ? '<w:shd w:fill="F6B5CF"/>' : ''}</w:tcPr>${paragraph(cell, index === 0)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph("Tábata's party — confirmações de presença", true)}${paragraph('30 de janeiro de 2027, às 12h • Chácara Recanto Feliz • Araras - SP')}${paragraph(`Exportado em ${date(now)}`)}${paragraph(`Vou: ${totals.yes} | Talvez: ${totals.maybe} | Não vou: ${totals.no} | Total de registros: ${responses.length}`, true)}${paragraph('Os totais incluem as respostas dos convidados e as presenças confirmadas pela Tábata. Familiares com registro próprio já estão contados. Outros acompanhantes mencionados nas observações devem ser considerados separadamente.')}${table}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:bottom="900" w:left="1100" w:right="1100"/></w:sectPr></w:body></w:document>`,
  });
}
