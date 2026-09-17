import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type { PublicUser } from '@shared/progress';
import type { ClientToServer, JoinResult, ServerToClient, TokenId } from '@shared/types';
import { AuthStore, COOKIE, authRouter, cleanName, parseCookies } from './auth';
import { openDb } from './db';
import { RoomManager, type Room } from './rooms';

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 3001);
const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
/** Comma-separated list of allowed browser origins for the socket, in production. */
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const SECURE_COOKIES = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE !== '0' : PROD;

const db = openDb(process.env.DB_FILE);
const store = new AuthStore(db);
store.prune();
setInterval(() => store.prune(), 6 * 60 * 60 * 1000).unref();

const app = express();
app.disable('x-powered-by');
// "true" trusts every hop, a number trusts that many hops (e.g. 1 behind Caddy),
// anything else is passed through as a list of proxy addresses.
const TRUST_PROXY = process.env.TRUST_PROXY;
if (TRUST_PROXY) {
  app.set('trust proxy', TRUST_PROXY === 'true' ? true : /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);
}

// Baseline security headers. The CSP allows Google Fonts and nothing else external.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "connect-src 'self' ws: wss:",
      "worker-src 'self' blob:",
      "frame-ancestors 'self'",
    ].join('; '));
  }
  next();
});

const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, {
  cors: { origin: PROD && ORIGINS.length ? ORIGINS : true, credentials: true },
  pingTimeout: 25_000,
  maxHttpBufferSize: 64_000,
  // CORS does not cover WebSocket upgrades, so check the Origin header here too.
  // Requests without an Origin (non-browser clients) are let through.
  allowRequest: (req, done) => {
    const origin = req.headers.origin;
    if (!PROD || !origin) return done(null, true);
    let ok = ORIGINS.includes(origin);
    if (!ok) {
      const host = req.headers['x-forwarded-host'] ?? req.headers.host;
      try { ok = new URL(origin).host === host; } catch { ok = false; }
    }
    done(ok ? null : 'origin not allowed', ok);
  },
});

const rooms = new RoomManager(io, {
  onReward: (userId, xp, coins, won) => {
    const u = store.addMatch(userId, xp, coins, won);
    return u ? store.toPublic(u) : null;
  },
});

app.get('/healthz', (_req, res) => res.json({ ok: true, ...rooms.stats(), online: io.engine.clientsCount }));
app.use('/api', authRouter(store, { secureCookies: SECURE_COOKIES }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// In production the client is served from the Vite build; in dev Vite proxies to us.
const dist = path.join(ROOT, 'dist');
if (PROD && existsSync(dist)) {
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/socket\.io|\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}

interface SocketData { code?: string; playerId?: string; user?: PublicUser | null }

// Who is this socket? A valid session cookie makes it a known account.
io.use((socket, next) => {
  const token = parseCookies(socket.handshake.headers.cookie)[COOKIE];
  const row = store.userForSession(token);
  (socket.data as SocketData).user = row ? store.toPublic(row) : null;
  next();
});

/** Tokens per second for game actions, per socket. */
const ACTIONS_PER_SEC = 12;

let onlineTimer: NodeJS.Timeout | null = null;
const announceOnline = () => {
  if (onlineTimer) return;
  onlineTimer = setTimeout(() => {
    onlineTimer = null;
    io.emit('online', io.engine.clientsCount);
  }, 1500);
};

io.on('connection', (socket) => {
  const data = socket.data as SocketData;
  announceOnline();
  socket.emit('online', io.engine.clientsCount);

  // A simple token bucket stops a stuck client from flooding the engine.
  let bucket = ACTIONS_PER_SEC * 2;
  let refilled = Date.now();
  socket.use((_packet, next) => {
    const now = Date.now();
    bucket = Math.min(ACTIONS_PER_SEC * 2, bucket + ((now - refilled) / 1000) * ACTIONS_PER_SEC);
    refilled = now;
    if (bucket < 1) return; // drop silently
    bucket -= 1;
    next();
  });

  /** The name a player sits down with: their account name, or what they typed. */
  const displayName = (typed: unknown) => {
    const u = data.user;
    if (u && !u.isGuest) return u.name;
    return cleanName(typed) || u?.name || `Player${Math.floor(Math.random() * 9000 + 1000)}`;
  };

  const ctx = (): { room: Room; playerId: string } | null => {
    if (!data.code || !data.playerId) return null;
    const room = rooms.get(data.code);
    if (!room) return null;
    return { room, playerId: data.playerId };
  };

  /** Runs an engine call and surfaces the rejection reason to the caller. */
  const act = (fn: (room: Room, playerId: string) => string | null | void) => {
    const c = ctx();
    if (!c) return socket.emit('notice', 'You are not at a table.');
    const err = fn(c.room, c.playerId);
    if (err) socket.emit('notice', err);
  };

  const leaveCurrent = () => {
    const c = ctx();
    if (!c) return;
    c.room.leave(socket.id);
    socket.leave(c.room.code);
    if (c.room.isEmpty && c.room.state.status !== 'playing') rooms.destroy(c.room.code);
    data.code = undefined;
    data.playerId = undefined;
  };

  const enter = (room: Room, playerId: string): JoinResult => {
    data.code = room.code;
    data.playerId = playerId;
    socket.join(room.code);
    const sessionToken = room.seat(socket.id, playerId);
    room.broadcast();
    return { ok: true, state: room.publicState(), playerId, sessionToken };
  };

  const safeCb = <T>(cb: unknown): ((r: T) => void) =>
    typeof cb === 'function' ? (cb as (r: T) => void) : () => undefined;

  socket.on('room:list', (cb) => safeCb(cb)(rooms.list()));

  socket.on('room:create', (p, cb) => {
    const reply = safeCb<JoinResult>(cb);
    leaveCurrent();
    const settings = p?.settings && typeof p.settings === 'object' ? p.settings : {};
    const room = rooms.create({
      ...settings,
      name: cleanName(settings.name) || `${displayName(p?.name)}'s table`,
    });
    const player = room.addHuman({
      name: displayName(p?.name), token: p?.token, color: p?.color, userId: data.user?.id,
    });
    if (!player) {
      rooms.destroy(room.code);
      return reply({ ok: false, error: 'Could not create the table. Try again.' });
    }
    reply(enter(room, player.id));
  });

  socket.on('room:join', (p, cb) => {
    const reply = safeCb<JoinResult>(cb);
    const room = rooms.get(String(p?.code ?? ''));
    if (!room || room.quick) return reply({ ok: false, error: 'No table with that code. Check it and try again.' });
    if (room.state.status !== 'lobby') return reply({ ok: false, error: 'That game has already started.' });
    if (room.state.players.length >= room.state.settings.maxPlayers) {
      return reply({ ok: false, error: 'That table is full.' });
    }
    if (data.code === room.code && data.playerId) return reply(enter(room, data.playerId));
    leaveCurrent();
    const player = room.addHuman({
      name: displayName(p?.name), token: p?.token, color: p?.color, userId: data.user?.id,
    });
    if (!player) return reply({ ok: false, error: 'That table is full.' });
    reply(enter(room, player.id));
  });

  socket.on('match:join', (p, cb) => {
    const reply = safeCb<JoinResult>(cb);
    leaveCurrent();
    const room = rooms.quickRoom();
    const player = room.addHuman({
      name: displayName(p?.name), token: p?.token, color: p?.color, userId: data.user?.id,
    });
    if (!player) return reply({ ok: false, error: 'Could not find a table. Try again.' });
    reply(enter(room, player.id));
  });

  socket.on('room:rejoin', (p, cb) => {
    const reply = safeCb<JoinResult>(cb);
    const room = rooms.get(String(p?.code ?? ''));
    if (!room) return reply({ ok: false, error: 'That table has closed.' });
    const playerId = room.reclaim(socket.id, String(p?.sessionToken ?? ''), data.user?.id ?? null);
    if (!playerId) return reply({ ok: false, error: 'Your seat is no longer available.' });
    data.code = room.code;
    data.playerId = playerId;
    socket.join(room.code);
    reply({
      ok: true, state: room.publicState(), playerId,
      sessionToken: String(p?.sessionToken), reward: room.rewardFor(playerId),
    });
  });

  socket.on('room:leave', leaveCurrent);

  socket.on('room:settings', (patch) => act((r, id) => (r.quick ? null : r.game.updateSettings(id, patch ?? {}))));
  socket.on('room:ready', (p) => act((r, id) => r.game.setReady(id, !!p?.ready)));
  socket.on('room:appearance', (patch) =>
    act((r, id) => {
      const next = { ...(patch ?? {}) };
      if (data.user && !data.user.isGuest) delete next.name;
      else if (next.name !== undefined) next.name = cleanName(next.name) || undefined;
      r.game.setAppearance(id, next);
    }),
  );

  socket.on('room:addBot', () =>
    act((r, id) => {
      if (r.quick) return 'Seats fill up on their own in Quick Play.';
      if (!r.game.player(id)?.isHost) return 'Only the host can fill seats.';
      if (r.state.status !== 'lobby') return 'The game has already started.';
      const p = r.addFiller();
      r.broadcast();
      return p ? null : 'The table is full.';
    }),
  );

  socket.on('room:kick', (p) =>
    act((r, id) => {
      const playerId = String(p?.playerId ?? '');
      if (r.quick) return 'There is no host in Quick Play.';
      if (!r.game.player(id)?.isHost) return 'Only the host can remove players.';
      if (playerId === id) return 'You cannot remove yourself.';
      if (!r.game.player(playerId)) return 'That player has already left.';
      for (const sid of r.socketsFor(playerId)) {
        const s = io.sockets.sockets.get(sid);
        s?.emit('kicked');
        s?.leave(r.code);
        if (s) { (s.data as SocketData).code = undefined; (s.data as SocketData).playerId = undefined; }
      }
      r.kick(playerId);
      return null;
    }),
  );

  socket.on('room:start', () => act((r, id) => (r.quick ? 'This table starts on its own.' : r.game.start(id))));

  socket.on('game:roll', () => act((r, id) => r.game.roll(id)));
  socket.on('game:buy', () => act((r, id) => r.game.buy(id)));
  socket.on('game:declineBuy', () => act((r, id) => r.game.declineBuy(id)));
  socket.on('game:endTurn', () => act((r, id) => r.game.endTurn(id)));
  socket.on('game:build', (p) => act((r, id) => r.game.build(id, Number(p?.tileId))));
  socket.on('game:sellHouse', (p) => act((r, id) => r.game.sellHouse(id, Number(p?.tileId))));
  socket.on('game:mortgage', (p) => act((r, id) => r.game.mortgage(id, Number(p?.tileId))));
  socket.on('game:unmortgage', (p) => act((r, id) => r.game.unmortgage(id, Number(p?.tileId))));
  socket.on('game:payJail', () => act((r, id) => r.game.payJail(id)));
  socket.on('game:useJailCard', () => act((r, id) => r.game.useJailCard(id)));
  socket.on('game:rollJail', () => act((r, id) => r.game.roll(id)));
  socket.on('game:bid', (p) => act((r, id) => r.game.bid(id, Math.floor(Number(p?.amount) || 0))));
  socket.on('game:passBid', () => act((r, id) => r.game.passBid(id)));
  socket.on('game:bankrupt', () => act((r, id) => r.game.declareBankrupt(id)));
  socket.on('game:acknowledgeCard', () => act((r, id) => r.game.acknowledgeCard(id)));

  socket.on('trade:offer', (p) =>
    act((r, id) => {
      if (!p || typeof p.to !== 'string' || !p.give || !p.want) return 'That offer is incomplete.';
      return r.game.offerTrade(id, p.to, p.give, p.want);
    }),
  );
  socket.on('trade:respond', (p) =>
    act((r, id) => r.game.respondTrade(id, String(p?.id ?? ''), !!p?.accept)),
  );
  socket.on('trade:cancel', (p) => act((r, id) => r.game.cancelTrade(id, String(p?.id ?? ''))));

  socket.on('chat:send', (p) => act((r, id) => r.game.chat(id, String(p?.text ?? ''))));

  // A dropped socket keeps its seat for a grace period; the sweeper reaps
  // rooms nobody comes back to.
  socket.on('disconnect', () => {
    ctx()?.room.release(socket.id);
    announceOnline();
  });
});

http.listen(PORT, () => {
  console.log(`[rentrush] server listening on http://localhost:${PORT}`);
});

function shutdown(signal: string) {
  console.log(`[rentrush] ${signal} received, closing…`);
  io.emit('notice', 'The server is restarting. You will be reconnected shortly.');
  rooms.destroyAll();
  io.close();
  http.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export type { TokenId };
