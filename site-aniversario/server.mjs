import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { createGuestDocx } from './lib/docx.mjs';
import { registerConfirmedGuests } from './lib/confirmed-guests.mjs';
import { expandCompanions, peopleSummary } from './lib/companions.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const scrypt = promisify(scryptCallback);
const sessionSeconds = 8 * 60 * 60;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const statusLabels = ['yes', 'maybe', 'no'];

async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}

async function passwordMatches(password, encoded) {
  const [salt, key] = encoded.split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function configuration(directory, suppliedPassword, suppliedSecret) {
  const path = resolve(directory, 'config.json');
  let config;
  try { config = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let initialPassword, passwordChanged = false;
  if (!config) {
    initialPassword = suppliedPassword || randomBytes(15).toString('base64url');
    config = { passwordHash: await passwordHash(initialPassword), jwtSecret: randomBytes(48).toString('base64url') };
  } else if (suppliedPassword && !(await passwordMatches(suppliedPassword, config.passwordHash))) {
    config.passwordHash = await passwordHash(suppliedPassword);
    passwordChanged = true;
  }
  if (suppliedSecret) config.jwtSecret = suppliedSecret;
  await writeFile(path + '.tmp', JSON.stringify(config), { mode: 0o600 });
  await rename(path + '.tmp', path);
  return { config, initialPassword: suppliedPassword ? undefined : initialPassword, passwordChanged };
}

function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function readToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 2048) return null;
    const [header, body, signature] = parts;
    const metadata = JSON.parse(Buffer.from(header, 'base64url'));
    if (metadata.alg !== 'HS256' || metadata.typ !== 'JWT') return null;
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== 'tabata-party' || payload.aud !== 'tabata-admin' || payload.sub !== 'organizer' ||
        !Number.isInteger(payload.exp) || payload.exp <= now || !Number.isInteger(payload.iat) || payload.iat > now + 30 ||
        typeof payload.jti !== 'string') return null;
    return payload;
  } catch { return null; }
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError(415, 'Não foi possível ler o envio. Atualize a página e tente novamente.');
  }
  return new Promise((resolveBody, rejectBody) => {
    const parts = [];
    let size = 0, tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8192) {
        if (!tooLarge) rejectBody(new HttpError(413, 'A mensagem está muito grande. Envie uma observação mais curta.'));
        tooLarge = true;
        return;
      }
      if (!tooLarge) parts.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const result = JSON.parse(Buffer.concat(parts).toString('utf8'));
        if (!result || Array.isArray(result) || typeof result !== 'object') throw new Error();
        resolveBody(result);
      } catch { rejectBody(new HttpError(400, 'Não foi possível ler a resposta. Tente enviar novamente.')); }
    });
    req.on('error', rejectBody);
  });
}

export async function createApp(options = {}) {
  const dataDir = resolve(options.dataDir || process.env.DATA_DIR || resolve(root, 'data'));
  const adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD;
  const jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET;
  const secure = options.secureCookies ?? process.env.NODE_ENV === 'production';
  const publicOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  if (adminPassword && (adminPassword.length < 12 || adminPassword.length > 256)) throw new Error('ADMIN_PASSWORD deve ter entre 12 e 256 caracteres.');
  if (jwtSecret && jwtSecret.length < 32) throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
  if (secure && (!publicOrigin || new URL(publicOrigin).protocol !== 'https:')) throw new Error('Em produção, configure PUBLIC_ORIGIN com a URL HTTPS do site.');
  if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin) throw new Error('PUBLIC_ORIGIN deve conter somente a origem, sem caminho ou barra no final.');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const { config, initialPassword, passwordChanged } = await configuration(dataDir, adminPassword, jwtSecret);
  const db = new DatabaseSync(resolve(dataDir, 'responses.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY, edit_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('yes','maybe','no')),
      note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS sessions (jti TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS companion_overrides (
      response_id TEXT PRIMARY KEY REFERENCES responses(id), companions TEXT NOT NULL, note_snapshot TEXT NOT NULL
    ) STRICT;`);
  registerConfirmedGuests(db);
  if (passwordChanged) db.exec('DELETE FROM sessions');

  const cookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  const findResponse = db.prepare('SELECT name, status, note FROM responses WHERE edit_hash = ?');
  const rows = db.prepare('SELECT id, name, status, note, created_at, updated_at FROM responses ORDER BY updated_at DESC, id');
  const listPeople = () => expandCompanions(rows.all(), db.prepare('SELECT * FROM companion_overrides').all());
  const session = (req) => {
    const token = readToken(cookies(req).tabata_admin || '', config.jwtSecret);
    return token && db.prepare('SELECT jti FROM sessions WHERE jti = ? AND expires_at > ?').get(token.jti, Math.floor(Date.now() / 1000)) ? token : null;
  };
  const requireAdmin = (req) => {
    const current = session(req);
    if (!current) throw new HttpError(401, 'Entre com sua senha para continuar.');
    return current;
  };
  const attempts = new Map();
  const rateLimit = (req, category, maximum, windowMs) => {
    const now = Date.now();
    const key = `${category}:${req.socket.remoteAddress}`;
    let record = attempts.get(key);
    if (!record || record.until <= now) {
      if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
      if (attempts.size > 10000) throw new HttpError(429, 'Muitos acessos agora. Aguarde alguns minutos.');
      record = { count: 0, until: now + windowMs };
      attempts.set(key, record);
    }
    if (++record.count > maximum) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
  };
  const staticPaths = new Map([
    ['/', ['index.html', 'text/html']], ['/admin', ['admin.html', 'text/html']], ['/admin/', ['admin.html', 'text/html']],
    ...['variables', 'base', 'layout', 'components', 'decorations', 'theme-y2k', 'theme-toggle', 'countdown', 'admin'].map((name) => [`/css/${name}.css`, [`css/${name}.css`, 'text/css']]),
    ...['rsvp', 'admin', 'theme', 'countdown'].map((name) => [`/js/${name}.js`, [`js/${name}.js`, 'text/javascript']]),
    ['/favicon.svg', ['favicon.svg', 'image/svg+xml']], ['/robots.txt', ['robots.txt', 'text/plain']],
    ...['jeans-colagem.jpg', 'jornal-recorte.jpg'].map((file) => [`/images/${file}`, [`images/${file}`, 'image/jpeg']]),
    ...['flor-cristal.png', 'globo-festa.png', 'beijo-pink.png', 'beijo-pink-sem-fundo.png'].map((file) => [`/images/${file}`, [`images/${file}`, 'image/png']]),
  ]);
  const assets = new Map();
  for (const [url, [file, type]] of staticPaths) {
    const buffer = await readFile(resolve(root, 'public', file));
    assets.set(url, { buffer, gzip: ['image/png', 'image/jpeg'].includes(type) ? null : gzipSync(buffer), type });
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (req.method === 'POST') {
        const origin = req.headers.origin;
        const expectedOrigin = publicOrigin || `http://${req.headers.host}`;
        if ((origin && origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') {
          throw new HttpError(403, 'Abra o site diretamente para enviar sua resposta.');
        }
      }
      if (route === '/api/rsvp' && req.method === 'GET') {
        const token = cookies(req).tabata_rsvp;
        return json(res, 200, { response: token ? findResponse.get(hash(token)) || null : null });
      }
      if (route === '/api/rsvp' && req.method === 'POST') {
        rateLimit(req, 'rsvp', 120, 60 * 60 * 1000);
        const body = await readJson(req);
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80 || /[\x00-\x1f\x7f]/u.test(body.name)) throw new HttpError(400, 'Escreva seu nome, com até 80 caracteres.');
        if (!statusLabels.includes(body.status)) throw new HttpError(400, 'Escolha “Vou”, “Talvez” ou “Não vou”.');
        if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(body.note))) throw new HttpError(400, 'A observação deve ter até 1.000 caracteres.');
        const name = body.name.trim().normalize('NFC');
        const note = (body.note || '').trim().normalize('NFC');
        const token = cookies(req).tabata_rsvp;
        const existing = token && findResponse.get(hash(token));
        const now = new Date().toISOString();
        if (existing) db.prepare('UPDATE responses SET name = ?, status = ?, note = ?, updated_at = ? WHERE edit_hash = ?').run(name, body.status, note, now, hash(token));
        else {
          const newToken = randomBytes(32).toString('base64url');
          db.prepare('INSERT INTO responses VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), hash(newToken), name, body.status, note, now, now);
          res.setHeader('Set-Cookie', cookie('tabata_rsvp', newToken, 180 * 24 * 60 * 60));
        }
        return json(res, 200, { message: existing ? 'Sua resposta foi atualizada!' : 'Sua resposta foi salva!', response: { name, status: body.status, note } });
      }
      if (route === '/api/admin/login' && req.method === 'POST') {
        rateLimit(req, 'login', 8, 15 * 60 * 1000);
        const body = await readJson(req);
        if (typeof body.password !== 'string' || body.password.length > 256 || !(await passwordMatches(body.password, config.passwordHash))) throw new HttpError(401, 'A senha não está correta. Confira e tente novamente.');
        attempts.delete(`login:${req.socket.remoteAddress}`);
        const now = Math.floor(Date.now() / 1000);
        const payload = { iss: 'tabata-party', aud: 'tabata-admin', sub: 'organizer', iat: now, exp: now + sessionSeconds, jti: randomUUID() };
        db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
        db.prepare('INSERT INTO sessions VALUES (?, ?)').run(payload.jti, payload.exp);
        res.setHeader('Set-Cookie', cookie('tabata_admin', signToken(payload, config.jwtSecret), sessionSeconds));
        return json(res, 200, { message: 'Você entrou.' });
      }
      if (route === '/api/admin/session' && req.method === 'GET') {
        requireAdmin(req);
        return json(res, 200, { authenticated: true });
      }
      if (route === '/api/admin/logout' && req.method === 'POST') {
        const current = requireAdmin(req);
        db.prepare('DELETE FROM sessions WHERE jti = ?').run(current.jti);
        res.setHeader('Set-Cookie', cookie('tabata_admin', '', 0));
        return json(res, 200, { message: 'Você saiu.' });
      }
      if (route === '/api/admin/responses' && req.method === 'GET') {
        requireAdmin(req);
        const responses = listPeople();
        return json(res, 200, { responses, totals: peopleSummary(responses) });
      }
      if (route === '/api/admin/companions' && req.method === 'POST') {
        requireAdmin(req);
        const body = await readJson(req);
        if (typeof body.response_id !== 'string' || body.response_id.length > 128) throw new HttpError(400, 'Escolha um convidado da lista.');
        const owner = db.prepare('SELECT id, note FROM responses WHERE id = ?').get(body.response_id);
        if (!owner) throw new HttpError(404, 'Esse convidado não foi encontrado. Atualize a lista.');
        if (body.reset === true) db.prepare('DELETE FROM companion_overrides WHERE response_id = ?').run(owner.id);
        else {
          if (!Array.isArray(body.companions) || body.companions.length > 40 || body.companions.some((name) => typeof name !== 'string' || !name.trim() || name.trim().length > 80 || /[\x00-\x1f\x7f]/u.test(name))) {
            throw new HttpError(400, 'Escreva um acompanhante por linha, com até 80 caracteres por nome e no máximo 40 acompanhantes.');
          }
          const companions = body.companions.map((name) => name.trim().normalize('NFC'));
          db.prepare(`INSERT INTO companion_overrides VALUES (?, ?, ?) ON CONFLICT(response_id)
            DO UPDATE SET companions = excluded.companions, note_snapshot = excluded.note_snapshot`).run(owner.id, JSON.stringify(companions), owner.note);
        }
        return json(res, 200, { message: body.reset === true ? 'Leitura automática restaurada.' : 'Acompanhantes conferidos e salvos.' });
      }
      if (route === '/api/admin/export.docx' && req.method === 'GET') {
        requireAdmin(req);
        const document = createGuestDocx(listPeople());
        res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="Presencas-Tabata.docx"', 'Content-Length': document.length, 'Cache-Control': 'no-store' });
        return res.end(document);
      }
      if (['GET', 'HEAD'].includes(req.method) && assets.has(route)) {
        const asset = assets.get(route);
        const compressed = asset.gzip && /\bgzip\b/u.test(req.headers['accept-encoding'] || '');
        const buffer = compressed ? asset.gzip : asset.buffer;
        if (compressed) res.setHeader('Content-Encoding', 'gzip');
        const contentType = /^(?:text\/|image\/svg\+xml)/u.test(asset.type) ? `${asset.type}; charset=utf-8` : asset.type;
        res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': buffer.length, 'Cache-Control': asset.type === 'text/html' ? 'no-cache' : 'public, max-age=300', 'Vary': 'Accept-Encoding', 'X-Robots-Tag': 'noindex, nofollow' });
        return res.end(req.method === 'HEAD' ? undefined : buffer);
      }
      throw new HttpError(404, 'Não encontramos essa página.');
    } catch (error) {
      if (!error.status) console.error('Erro ao atender solicitação:', error.code || error.name);
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Não foi possível concluir agora. Tente novamente em instantes.' });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return { server, initialPassword, close: () => new Promise((done, reject) => server.close((error) => { db.close(); error ? reject(error) : done(); })) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const app = await createApp();
    const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
    app.server.listen(port, host, () => {
      console.log(`Tábata's party: http://${host}:${port}\nÁrea da organizadora: http://${host}:${port}/admin`);
      if (app.initialPassword) console.log(`\nSua senha inicial (guarde em um local seguro): ${app.initialPassword}\nEla é mostrada apenas na primeira execução. Veja o README para escolher outra senha.`);
    });
    app.server.on('error', (error) => { console.error(`Não foi possível iniciar: ${error.code || error.message}`); process.exitCode = 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
