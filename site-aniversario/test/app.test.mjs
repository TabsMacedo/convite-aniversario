import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';

const qaRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../.qa');
const password = 'senha-apenas-do-teste-2027';
const secret = 'segredo-exclusivo-dos-testes-0123456789';
const post = (body, extra = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
const cookieFrom = (response) => response.headers.get('set-cookie')?.split(';')[0];

async function fixture(options = {}, prepare) {
  await mkdir(qaRoot, { recursive: true });
  const dataDir = await mkdtemp(resolve(qaRoot, 'integration-'));
  if (prepare) await prepare(dataDir);
  const start = async () => {
    const app = await createApp({ dataDir, adminPassword: password, jwtSecret: secret, ...options });
    await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
    return app;
  };
  let app = await start();
  const fixtureApi = {
    get url() { return `http://127.0.0.1:${app.server.address().port}`; },
    async restart() { await app.close(); app = await start(); },
    async close() {
      await app.close();
      assert.equal(dirname(dataDir), qaRoot);
      await rm(dataDir, { recursive: true, force: true });
    },
  };
  return fixtureApi;
}

function signed(payload, header = { alg: 'HS256', typ: 'JWT' }) {
  const content = [header, payload].map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return `${content}.${createHmac('sha256', secret).update(content).digest('base64url')}`;
}

function unzipStored(buffer) {
  const files = new Map();
  let index = 0;
  while (buffer.readUInt32LE(index) === 0x04034b50) {
    const length = buffer.readUInt32LE(index + 18);
    const nameLength = buffer.readUInt16LE(index + 26);
    const extraLength = buffer.readUInt16LE(index + 28);
    const name = buffer.subarray(index + 30, index + 30 + nameLength).toString();
    const start = index + 30 + nameLength + extraLength;
    files.set(name, buffer.subarray(start, start + length).toString());
    index = start + length;
  }
  assert.equal(buffer.readUInt32LE(index), 0x02014b50);
  return files;
}

test('fluxo real de convidados, autenticação, DOCX e persistência', async (t) => {
  const app = await fixture();
  t.after(() => app.close());
  const request = (path, options) => fetch(app.url + path, options);
  let guestCookie, adminCookie;
  const name = 'Ana & João <família>';
  const note = 'Vou com meu cônjuge.\nRecado com <símbolos> & acentos: coração!';

  await t.test('página e arquivos são leves e dados privados não são públicos', async () => {
    const page = await request('/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await page.text(), /30 de janeiro de 2027/);
    for (const path of ['/api/admin/responses', '/api/admin/export.docx']) assert.equal((await request(path)).status, 401);
    for (const path of ['/data/config.json', '/data/responses.sqlite', '/.env', '/server.mjs']) assert.equal((await request(path)).status, 404);
    assert.deepEqual(await (await request('/api/rsvp')).json(), { response: null });
    const css = await request('/css/components.css');
    assert.equal(css.headers.get('content-encoding'), 'gzip');
    assert.ok(Number(css.headers.get('content-length')) < 6000);
  });

  await t.test('servidor rejeita campos inválidos, corpo excessivo e envio por outra origem', async () => {
    for (const body of [{ name: ' ', status: 'yes' }, { name: 'Teste', status: 'invalido' }, { name: 'Teste', status: 'yes', note: 'x'.repeat(1001) }, { name: 123, status: 'no' }]) {
      assert.equal((await request('/api/rsvp', post(body))).status, 400);
    }
    assert.equal((await request('/api/rsvp', post({ name: 'Teste', status: 'yes' }, { Origin: 'https://outra-origem.example' }))).status, 403);
    assert.equal((await request('/api/rsvp', post({ name: 'Teste', status: 'yes' }, { 'Sec-Fetch-Site': 'cross-site' }))).status, 403);
    assert.equal((await request('/api/rsvp', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await request('/api/rsvp', post({ name: 'Teste', status: 'yes', note: 'x'.repeat(9000) }))).status, 413);
  });

  await t.test('resposta é salva, recuperada e atualizada sem duplicar no mesmo navegador', async () => {
    const first = await request('/api/rsvp', post({ name, status: 'maybe', note }));
    assert.equal(first.status, 200);
    assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    guestCookie = cookieFrom(first);
    assert.deepEqual((await (await request('/api/rsvp', { headers: { Cookie: guestCookie } })).json()).response, { name, status: 'maybe', note });
    const update = await request('/api/rsvp', post({ name, status: 'yes', note }, { Cookie: guestCookie }));
    assert.equal(update.status, 200);
    assert.match((await update.json()).message, /atualizada/);
    const differentPerson = await request('/api/rsvp', post({ name, status: 'no', note: '' }));
    assert.equal(differentPerson.status, 200);
    assert.notEqual(cookieFrom(differentPerson), guestCookie);
  });

  await t.test('senha correta abre sessão JWT e consulta nomes, observações e respostas', async () => {
    assert.equal((await request('/api/admin/login', post({ password: 'errada' }))).status, 401);
    const login = await request('/api/admin/login', post({ password }));
    assert.equal(login.status, 200);
    adminCookie = cookieFrom(login);
    const token = adminCookie.slice('tabata_admin='.length);
    assert.equal(token.split('.').length, 3);
    assert.equal(JSON.parse(Buffer.from(token.split('.')[0], 'base64url')).alg, 'HS256');
    const response = await request('/api/admin/responses', { headers: { Cookie: adminCookie } });
    const result = await response.json();
    assert.equal(result.responses.length, 10);
    assert.deepEqual(result.responses.map((r) => r.status).sort(), ['no', ...Array(9).fill('yes')]);
    assert.ok(result.responses.some((r) => r.note === note));
    assert.ok(result.responses.every((r) => !('edit_hash' in r)));
  });

  await t.test('JWT adulterado, expirado, com algoritmo ou destinatário incorretos é rejeitado', async () => {
    const raw = adminCookie.slice('tabata_admin='.length);
    const payload = JSON.parse(Buffer.from(raw.split('.')[1], 'base64url'));
    const candidates = [raw.slice(0, -4) + 'aaaa', signed({ ...payload, exp: 1 }), signed({ ...payload, aud: 'outro' }), signed(payload, { alg: 'none', typ: 'JWT' })];
    for (const token of candidates) assert.equal((await request('/api/admin/session', { headers: { Cookie: `tabata_admin=${token}` } })).status, 401);
  });

  await t.test('download é DOCX válido com XML escapado e observação completa', async () => {
    const response = await request('/api/admin/export.docx', { headers: { Cookie: adminCookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /wordprocessingml/);
    const files = unzipStored(Buffer.from(await response.arrayBuffer()));
    assert.ok(files.has('[Content_Types].xml'));
    assert.ok(files.has('_rels/.rels'));
    const xml = files.get('word/document.xml');
    assert.match(xml, /<w:tbl>/);
    assert.match(xml, /Vou: 9 \| Talvez: 0 \| Não vou: 1/);
    assert.ok(xml.includes('Ana &amp; João &lt;família&gt;'));
    assert.ok(xml.includes('Recado com &lt;símbolos&gt; &amp; acentos: coração!'));
  });

  await t.test('reiniciar mantém respostas e sessão; sair revoga o JWT capturado', async () => {
    await app.restart();
    const own = await request('/api/rsvp', { headers: { Cookie: guestCookie } });
    assert.equal((await own.json()).response.note, note);
    assert.equal((await request('/api/admin/session', { headers: { Cookie: adminCookie } })).status, 200);
    assert.equal((await request('/api/admin/logout', post({}, { Cookie: adminCookie }))).status, 200);
    assert.equal((await request('/api/admin/session', { headers: { Cookie: adminCookie } })).status, 401);
  });
});

test('família é incluída no banco existente e no DOCX sem duplicar ou alterar Maria, Ariane e Carlos neto', async (t) => {
  const previousDate = '2026-11-01T12:00:00.000Z';
  const mariaNote = 'Minha confirmação e meu recado original.';
  const app = await fixture({}, (dataDir) => {
    const db = new DatabaseSync(resolve(dataDir, 'responses.sqlite'));
    try {
      db.exec(`CREATE TABLE responses (
        id TEXT PRIMARY KEY, edit_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('yes','maybe','no')),
        note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT`);
      const insert = db.prepare('INSERT INTO responses VALUES (?, ?, ?, ?, ?, ?, ?)');
      insert.run('existing-maria', 'private-maria-hash', 'Maria', 'yes', mariaNote, previousDate, previousDate);
      insert.run('existing-carlos-neto', 'private-neto-hash', 'Carlos de Macedo (neto)', 'maybe', 'Decidindo.', previousDate, previousDate);
      insert.run('existing-ariane', 'private-ariane-hash', 'Ariane', 'yes', 'Meu recado original.', previousDate, previousDate);
    } finally { db.close(); }
  });
  t.after(() => app.close());
  const request = (path, options) => fetch(app.url + path, options);
  assert.equal((await request('/api/admin/responses')).status, 401);
  assert.equal((await request('/lib/confirmed-guests.mjs')).status, 404);
  const login = await request('/api/admin/login', post({ password }));
  assert.equal(login.status, 200);
  const headers = { Cookie: cookieFrom(login) };
  const list = async () => (await (await request('/api/admin/responses', { headers })).json()).responses;
  const before = await list();
  assert.equal(before.length, 11);
  for (const name of ['Tábata', 'Gabriel', 'Marcelo', 'Patrícia', 'Carlos de Macedo (pai)', 'Kalel', 'Elza', 'Neném']) {
    const matches = before.filter((row) => row.name === name);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].status, 'yes');
    assert.match(matches[0].note, /confirmada pela Tábata/);
  }
  const maria = before.filter((row) => row.name === 'Maria');
  assert.equal(maria.length, 1);
  assert.equal(maria[0].id, 'existing-maria');
  assert.equal(maria[0].note, mariaNote);
  assert.equal(maria[0].updated_at, previousDate);
  const ariane = before.filter((row) => row.name === 'Ariane');
  assert.equal(ariane.length, 1);
  assert.equal(ariane[0].id, 'existing-ariane');
  assert.equal(ariane[0].status, 'yes');
  assert.equal(ariane[0].note, 'Meu recado original.');
  assert.equal(ariane[0].updated_at, previousDate);
  assert.match(before.find((row) => row.name === 'Kalel').note, /Namorado da Ariane/);
  assert.equal(before.find((row) => row.id === 'existing-carlos-neto').status, 'maybe');
  await app.restart();
  await app.restart();
  assert.deepEqual(await list(), before);
  const download = await request('/api/admin/export.docx', { headers });
  assert.equal(download.status, 200);
  const xml = unzipStored(Buffer.from(await download.arrayBuffer())).get('word/document.xml');
  assert.match(xml, /Vou: 10 \| Talvez: 1 \| Não vou: 0/);
  for (const row of before) assert.ok(xml.includes(row.name));
  assert.ok(xml.includes(mariaNote));
});

test('produção usa cookies Secure e limita tentativas de senha', async (t) => {
  const app = await fixture({ secureCookies: true, publicOrigin: 'https://festa.example' });
  t.after(() => app.close());
  const login = await fetch(app.url + '/api/admin/login', post({ password }, { Origin: 'https://festa.example' }));
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /; Secure/);
  assert.match(login.headers.get('strict-transport-security'), /max-age=/);
  for (let i = 0; i < 8; i++) {
    assert.equal((await fetch(app.url + '/api/admin/login', post({ password: 'incorreta' }, { Origin: 'https://festa.example' }))).status, 401);
  }
  assert.equal((await fetch(app.url + '/api/admin/login', post({ password }, { Origin: 'https://festa.example' }))).status, 429);
});
