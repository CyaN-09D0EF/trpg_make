import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createGame, applyAction, joinGame, projectedState, GameError, ROLES } from './lib/game.mjs';
import { RoomStore } from './lib/storage.mjs';
import { restoreCampaign, MAX_CAMPAIGN_BYTES } from './lib/campaign.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('base64url');
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

async function body(req, maxBytes = 16384) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new GameError('요청이 너무 큽니다.', 413);
    chunks.push(chunk);
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new GameError('JSON 형식이 올바르지 않습니다.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new GameError('JSON 객체가 필요합니다.');
  return parsed;
}
function authenticate(room, req) {
  const value = req.headers.authorization?.replace(/^Bearer /, '') || '';
  if (value.length > 200) throw new GameError('접속 정보가 올바르지 않습니다.', 401);
  const hash = digest(value);
  const role = ROLES.find(r => safeEqual(room.players[r]?.tokenHash, hash));
  if (!role) throw new GameError('접속 정보가 만료되었거나 자리가 해제되었습니다. 초대 링크로 다시 참여하세요.', 401);
  return role;
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}
export async function createApp({ dataDir = process.env.DATA_DIR || path.join(ROOT, 'data') } = {}) {
  const store = new RoomStore(dataDir);
  await store.load();
  const connections = new Map();
  const limits = new Map();
  const online = id => [...new Set([...connections.values()].filter(c => c.id === id).map(c => c.role))];
  function broadcast(id) {
    const room = store.rooms.get(id);
    if (!room) return;
    for (const [res, connection] of connections) if (connection.id === id) {
      // Released slots lose stream access immediately, even if another player claims the role.
      if (room.players[connection.role]?.tokenHash !== connection.hash) { res.end(); connections.delete(res); continue; }
      res.write(`data: ${JSON.stringify(projectedState(room, connection.role, online(id)))}\n\n`);
    }
  }
  function rateLimit(req, kind) {
    const key = `${req.socket.remoteAddress}:${kind}`;
    const now = Date.now();
    const entry = limits.get(key);
    if (!entry || now - entry.start > 60000) limits.set(key, { start: now, count: 1 });
    else { entry.count++; if (entry.count > (kind === 'create' ? 12 : 180)) throw new GameError('요청이 너무 많습니다. 잠시 후 다시 시도하세요.', 429); }
    if (limits.size > 10000) for (const [k, e] of limits) if (now - e.start > 60000) limits.delete(k);
  }
  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST') {
        rateLimit(req, 'mutate');
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new GameError('다른 사이트에서 보낸 요청은 허용되지 않습니다.', 403);
        if (!req.headers['content-type']?.startsWith('application/json')) throw new GameError('application/json 요청이 필요합니다.', 415);
      }
      if (url.pathname === '/api/health' && req.method === 'GET') return json(200, { ok: true });
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        rateLimit(req, 'create');
        const input = await body(req);
        const name = input.name;
        const gmName = typeof input.playerName === 'string' ? input.playerName.trim() : '';
        if (!gmName || gmName.length > 24) throw new GameError('GM 이름은 1~24자로 입력하세요.');
        if (input.seed !== undefined && (typeof input.seed !== 'string' || input.seed.length > 80)) throw new GameError('시드는 80자 이하로 입력하세요.');
        let id;
        do { id = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (store.rooms.has(id));
        const key = token();
        const room = createGame({ id, name, seed: input.seed?.trim() || randomBytes(5).toString('hex'), gmName, gmHash: digest(key), invite: token() });
        await store.save(room);
        return json(201, { id, token: key, role: 'gm', state: projectedState(room, 'gm') });
      }
      if (url.pathname === '/api/rooms/import' && req.method === 'POST') {
        rateLimit(req, 'create');
        const input = await body(req, MAX_CAMPAIGN_BYTES);
        const gmName = typeof input.playerName === 'string' ? input.playerName.trim() : '';
        if (!gmName || gmName.length > 24) throw new GameError('GM 이름은 1~24자로 입력하세요.');
        let id;
        do { id = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); } while (store.rooms.has(id));
        const key = token();
        let room;
        try { room = restoreCampaign(input.campaign, {id,gmName,gmHash:digest(key),invite:token()}); }
        catch (error) {
          if (error instanceof GameError) throw error;
          throw new GameError('불러오기 파일의 구조가 올바르지 않습니다. GM이 내보낸 기록 JSON을 선택하세요.');
        }
        await store.save(room);
        return json(201, {id,token:key,role:'gm',state:projectedState(room,'gm')});
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|state|events|actions|export))?$/);
      if (match) {
        const [, id, endpoint] = match;
        const room = store.rooms.get(id);
        if (!room) throw new GameError('존재하지 않는 게임방입니다.', 404);
        if (endpoint === 'join' && req.method === 'POST') {
          const input = await body(req);
          const key = token();
          await store.mutate(id, current => {
            if (!safeEqual(input.invite, current.invite)) throw new GameError('초대 링크가 올바르지 않습니다.', 403);
            joinGame(current, { role: input.role, name: input.name, tokenHash: digest(key) });
            current.revision++; current.updatedAt = new Date().toISOString();
          });
          broadcast(id);
          return json(200, { id, token: key, role: input.role, state: projectedState(store.rooms.get(id), input.role, online(id)) });
        }
        const role = authenticate(room, req);
        if (endpoint === 'state' && req.method === 'GET') return json(200, projectedState(room, role, online(id)));
        if (endpoint === 'export' && req.method === 'GET') {
          if (role !== 'gm') throw new GameError('GM만 기록을 내보낼 수 있습니다.', 403);
          // Export contains the world and records, but no access or invitation secrets.
          const exported = structuredClone(room);
          delete exported.invite;
          exported.players = Object.fromEntries(ROLES.map(r => [r, room.players[r] ? { name: room.players[r].name } : null]));
          res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}.json"`);
          return json(200, exported);
        }
        if (endpoint === 'events' && req.method === 'GET') {
          if ([...connections.values()].filter(c => c.id === id && c.role === role).length >= 8) throw new GameError('이 역할의 연결이 너무 많습니다.', 429);
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
          res.flushHeaders();
          connections.set(res, { id, role, hash: digest(req.headers.authorization.replace(/^Bearer /, '')) });
          broadcast(id);
          const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20000);
          res.on('close', () => { clearInterval(heartbeat); connections.delete(res); broadcast(id); });
          return;
        }
        if (endpoint === 'actions' && req.method === 'POST') {
          const input = await body(req);
          await store.mutate(id, current => { const currentRole = authenticate(current, req); applyAction(current, currentRole, input); });
          broadcast(id);
          return json(200, projectedState(store.rooms.get(id), role, online(id)));
        }
        throw new GameError('지원하지 않는 요청입니다.', 405);
      }
      if (url.pathname.startsWith('/api/')) throw new GameError('찾을 수 없는 API입니다.', 404);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new GameError('지원하지 않는 요청입니다.', 405);
      let file;
      if (url.pathname === '/' || /^\/r\/[A-Z0-9]{6}$/.test(url.pathname)) file = path.join(ROOT, 'public/index.html');
      else if (url.pathname === '/world.mjs') file = path.join(ROOT, 'lib/world.mjs');
      else if (url.pathname === '/rulebook.md') file = path.join(ROOT, 'docs/rulebook.md');
      else if (['/app.js', '/style.css', '/favicon.svg'].includes(url.pathname)) file = path.join(ROOT, 'public', url.pathname.slice(1));
      else throw new GameError('파일을 찾을 수 없습니다.', 404);
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      if (!(error instanceof GameError)) console.error('Request failed:', error.message);
      json(error.status || 500, { error: error instanceof GameError ? error.message : '서버 처리 중 오류가 발생했습니다. 기록을 확인하고 다시 시도하세요.' });
    }
  });
  server.on('close', () => { for (const res of connections.keys()) res.end(); });
  return { server, store, close: async () => {
    for (const res of connections.keys()) res.end();
    server.closeIdleConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  app.server.listen(port, host, () => console.log(`신들의 문명 · ${host}:${port} · ${app.store.rooms.size} saved room(s)`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
