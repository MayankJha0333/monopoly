/**
 * End-to-end check over real sockets: two clients create and join a private
 * room, add a bot, play out turns, and reconnect after a drop.
 * Run with `npm run e2e` (the server must not already be on the test port).
 */
import { spawn } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import type { GameState, JoinResult } from '@shared/types';

const PORT = 3011;
const URL = `http://localhost:${PORT}`;

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function connect(): Socket {
  return io(URL, { transports: ['websocket'], forceNew: true });
}

const ask = <T>(s: Socket, event: string, payload?: unknown): Promise<T> =>
  new Promise((resolve) => {
    if (payload === undefined) s.emit(event, resolve);
    else s.emit(event, payload, resolve);
  });

/** Resolves once the shared state satisfies `pred`, or times out. */
function until(get: () => GameState | null, pred: (s: GameState) => boolean, ms = 12_000) {
  return new Promise<boolean>((resolve) => {
    const started = Date.now();
    const handle = setInterval(() => {
      const s = get();
      if (s && pred(s)) { clearInterval(handle); resolve(true); }
      else if (Date.now() - started > ms) { clearInterval(handle); resolve(false); }
    }, 50);
  });
}

async function main() {
  const server = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: ':memory:', NODE_ENV: 'test', BOT_PACE: '0.25' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const stopServer = () => { try { process.kill(-server.pid!, 'SIGTERM'); } catch { server.kill(); } };
  process.on('exit', stopServer);
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  await new Promise<void>((resolve) => {
    server.stdout.on('data', (d) => { if (String(d).includes('listening')) resolve(); });
  });

  const a = connect();
  const b = connect();
  // A holder keeps TypeScript from narrowing these to null across awaits.
  const box: { a: GameState | null; b: GameState | null } = { a: null, b: null };
  const noticesA: string[] = [];
  a.on('state', (s: GameState) => { box.a = s; });
  b.on('state', (s: GameState) => { box.b = s; });
  a.on('notice', (m: string) => noticesA.push(m));
  let diceSeen = 0;
  const announced: string[] = [];
  b.on('announce', (x: { text: string }) => announced.push(x.text));
  a.on('dice', () => { diceSeen++; });

  await new Promise<void>((r) => a.on('connect', () => r()));
  await new Promise<void>((r) => b.on('connect', () => r()));

  const created = await ask<JoinResult>(a, 'room:create', {
    name: 'Ada', token: 'hat', color: '#e8443a',
    settings: { name: 'Test table', isPrivate: true, turnSeconds: 0 },
  });
  check('host creates a private room', created.ok && !!created.state?.code, created.error);
  const code = created.state!.code;
  const hostId = created.playerId!;

  const wrong = await ask<JoinResult>(b, 'room:join', { code: 'ZZZZZ', name: 'Bob', token: 'car', color: '#3aa0e8' });
  check('joining a bad code is rejected', !wrong.ok, wrong.error);

  const joined = await ask<JoinResult>(b, 'room:join', { code, name: 'Bob', token: 'car', color: '#3aa0e8' });
  check('second player joins by code', joined.ok, joined.error);
  const guestId = joined.playerId!;

  const hidden = await ask<{ code: string }[]>(a, 'room:list');
  check('private room is hidden from the public list', !hidden.some((r) => r.code === code));

  a.emit('room:addBot');
  await until(() => box.a, (s) => s.players.length === 3);
  check('host fills a seat', box.a!.players.length === 3);
  check('seat fillers look like players', box.a!.players.every((p) => !p.isBot),
    box.a!.players.map((p) => p.name).join(', '));

  a.emit('room:start');
  await wait(150);
  check('start is blocked until everyone is ready', box.a!.status === 'lobby');

  b.emit('room:ready', { ready: true });
  await until(() => box.a, (s) => s.players.every((p) => p.ready || p.isHost));
  a.emit('room:start');
  const started = await until(() => box.a, (s) => s.status === 'playing');
  check('game starts once everyone is ready', started);

  b.emit('room:settings', { startingCash: 99999 });
  await wait(200);
  check('non-host cannot change settings', box.a!.settings.startingCash === 1500);

  // Drive the humans through a stretch of turns; bots drive themselves.
  const phaseSeen: Record<string, number> = {};
  const humans: [Socket, string][] = [[a, hostId], [b, guestId]];
  let acted = 0;
  let bidsPlaced = 0;

  for (let i = 0; i < 500 && box.a?.status === 'playing'; i++) {
    const s = box.a!;

    // Every bidder answers an auction, not just the player whose turn it is.
    if (s.auction) {
      for (const [sock, id] of humans) {
        if (!s.auction.active.includes(id)) continue;
        const me = s.players.find((p) => p.id === id)!;
        const next = s.auction.highBid + 20;
        if (bidsPlaced < 3 && next < me.cash / 4) { sock.emit('game:bid', { amount: next }); bidsPlaced++; }
        else sock.emit('game:passBid');
      }
    }

    const turnSock = humans.find(([, id]) => id === s.turn.playerId)?.[0];
    if (!turnSock) { await wait(40); continue; }

    if (s.debt && s.debt.debtorId === s.turn.playerId) turnSock.emit('game:bankrupt');
    else if (s.turn.phase === 'pre-roll') turnSock.emit('game:roll');
    else if (s.turn.phase === 'awaiting-buy') turnSock.emit(i % 10 < 7 ? 'game:buy' : 'game:declineBuy');
    else if (s.turn.phase === 'post-roll') turnSock.emit('game:endTurn');
    if (s.drawnCard?.playerId === s.turn.playerId) turnSock.emit('game:acknowledgeCard');

    phaseSeen[s.turn.phase] = (phaseSeen[s.turn.phase] ?? 0) + 1;
    acted++;
    await wait(30);
  }

  console.log('  debug phases:', JSON.stringify(phaseSeen));
  console.log('  debug notices:', JSON.stringify([...new Set(noticesA)].slice(0, 6)));
  check('turns advance for both clients', acted > 30, `${acted} actions`);
  check('dice events reach clients', diceSeen > 10, `${diceSeen} throws`);
  const auctionCleared = await until(() => box.a, (s) => !s.auction, 25_000);
  check('auctions run and resolve', bidsPlaced > 0 && auctionCleared, `${bidsPlaced} bids placed`);
  check('game log is populated', (box.a?.log.length ?? 0) > 20, `${box.a?.log.length} entries`);
  check('clients agree on the turn', box.a?.turn.playerId === box.b?.turn.playerId);
  check('other players hear about purchases', announced.some((t) => / bought /.test(t)), `${announced.length} announcements`);
  check('someone owns property', Object.values(box.a!.properties).some((p) => p.owner));

  a.emit('chat:send', { text: 'good game' });
  await until(() => box.b, (s) => s.chat.some((m) => m.text === 'good game'));
  check('chat reaches the other player', !!box.b?.chat.some((m) => m.text === 'good game'));

  // Reconnect flow.
  b.disconnect();
  await wait(300);
  const b2 = connect();
  await new Promise<void>((r) => b2.on('connect', () => r()));
  const back = await ask<JoinResult>(b2, 'room:rejoin', { code, sessionToken: joined.sessionToken });
  check('a dropped player reclaims their seat', back.ok && back.playerId === guestId, back.error);

  const stranger = await ask<JoinResult>(connect(), 'room:rejoin', { code, sessionToken: 'not-a-real-token' });
  check('a bad session token is refused', !stranger.ok, stranger.error);

  // Accounts over HTTP, then a socket that carries the session cookie.
  const post = (path: string, body: unknown, cookie = '') => fetch(`${URL}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const g = await post('/auth/guest', { name: 'Sandy', token: 'dog', color: '#42c26b' });
  const guestCookie = (g.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const gUser = (await g.json()) as { user?: { name: string; isGuest: boolean } };
  check('guest account is created', g.status === 201 && gUser.user?.isGuest === true && !!guestCookie);
  const weak = await post('/auth/signup', { username: 'sandy_99', email: 'sandy@example.com', password: 'short' }, guestCookie);
  check('weak password is refused', weak.status === 400);
  const su = await post('/auth/signup', { username: 'sandy_99', email: 'sandy@example.com', password: 'beach1234' }, guestCookie);
  const memberCookie = (su.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  check('guest signs up', su.status === 201 && !!memberCookie);
  const dupe = await post('/auth/signup', { username: 'SANDY_99', email: 'other@example.com', password: 'beach1234' });
  check('duplicate username is refused', dupe.status === 409);
  const badLogin = await post('/auth/login', { login: 'sandy_99', password: 'wrong-pass1' });
  check('wrong password is refused', badLogin.status === 401);
  const goodLogin = await post('/auth/login', { login: 'sandy@example.com', password: 'beach1234' });
  check('member logs in by email', goodLogin.status === 200);
  const cross = await fetch(`${URL}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ login: 'sandy_99', password: 'beach1234' }),
  });
  check('cross-site login is blocked', cross.status === 403);

  // Quick Play: one real player is seated, the table fills and starts itself.
  const q = io(URL, { transports: ['websocket'], forceNew: true, extraHeaders: { cookie: memberCookie } });
  const qbox: { s: GameState | null } = { s: null };
  let rewarded = false;
  q.on('state', (s: GameState) => { qbox.s = s; });
  q.on('reward', () => { rewarded = true; });
  await new Promise<void>((r) => q.on('connect', () => r()));
  const qm = await ask<JoinResult>(q, 'match:join', { name: 'ignored', token: 'dog', color: '#42c26b' });
  check('quick play seats the player', qm.ok && !!qm.state?.quickMatch, qm.error);
  check('signed-in players sit under their account name',
    !!qm.state?.players.some((p) => p.name === 'sandy_99'));
  const qStarted = await until(() => qbox.s, (s) => s.status === 'playing', 20_000);
  check('a quick table fills and starts on its own', qStarted && qbox.s!.players.length === 4,
    `${qbox.s?.players.length} players`);
  check('quick tables never reveal fillers', !!qbox.s && qbox.s.players.every((p) => !p.isBot));
  check('quick tables have a round cap', (qbox.s?.settings.maxRounds ?? 0) > 0);
  q.emit('room:leave');
  await wait(300);
  check('no reward for leaving early', !rewarded);
  q.close();

  const health = await (await fetch(`${URL}/healthz`)).json() as { ok: boolean };
  check('health check answers', health.ok === true);

  a.close(); b2.close();
  stopServer();
  await wait(200);

  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(', ')}` : '\nall end-to-end checks passed');
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
