import { nanoid } from 'nanoid';
import type { Server } from 'socket.io';
import { matchReward, type MatchReward, type PublicUser } from '@shared/progress';
import type { GameState, Player, RoomSettings, RoomSummary, TokenId } from '@shared/types';
import { Game } from './engine';
import { botStep } from './bot';
import { fillerName } from './names';

/** Ambiguous characters are left out so codes survive being read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TICK_MS = 500;
const BOT_TICK_MS = 250;
const BROADCAST_DEBOUNCE_MS = 40;
const ABANDON_MS = 15 * 60 * 1000;
const ENDED_QUICK_TTL_MS = 3 * 60 * 1000;
/** How long a seat is held open after a disconnect, so a reload can reclaim it. */
const RECONNECT_GRACE_MS = 60_000;

/** Quick Play tables: small, brisk, and capped so a match fits a coffee break. */
export const QUICK_SETTINGS: Partial<RoomSettings> = {
  name: 'Quick match',
  isPrivate: true,
  maxPlayers: 4,
  turnSeconds: 30,
  auctions: false,
  maxRounds: 15,
  startingCash: 1500,
};
const QUICK_SIZE = 4;
/** How long a Quick Play table waits for real players before topping up. */
const QUICK_WAIT_MS: [number, number] = [2500, 5000];
const QUICK_SEAT_GAP_MS: [number, number] = [600, 1500];
const QUICK_COUNTDOWN_MS = 3500;

/** Scales filler think-time; tests set BOT_PACE below 1 to run faster. */
const BOT_PACE = Math.max(0.05, Number(process.env.BOT_PACE ?? 1) || 1);

const between = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo);

export type Reward = MatchReward;

export interface RoomHooks {
  /** Credits a finished match to a user account; returns their new totals. */
  onReward?: (userId: string, xp: number, coins: number, won: boolean) => PublicUser | null;
}

export class Room {
  readonly code: string;
  readonly game: Game;
  readonly quick: boolean;
  /** socket.id -> playerId */
  private seats = new Map<string, string>();
  /** playerId -> session token used to reclaim a seat after a reload */
  private tokens = new Map<string, string>();
  /** playerId -> account id, for humans who were signed in (guest or member) */
  private users = new Map<string, string>();
  /** seat fillers — never exposed to clients */
  private fillers = new Set<string>();
  /** humans who left mid-game; the table plays their turns for them */
  private autopilot = new Set<string>();
  private timers: NodeJS.Timeout[] = [];
  private oneShots = new Set<NodeJS.Timeout>();
  private graceTimers = new Map<string, NodeJS.Timeout>();
  private flushHandle: NodeJS.Timeout | null = null;
  private nextBotAt = 0;
  private rewards = new Map<string, Reward>();
  lastActivity = Date.now();
  endedAt = 0;

  constructor(
    private io: Server,
    code: string,
    settings: Partial<RoomSettings>,
    opts: { quick?: boolean; hooks?: RoomHooks } = {},
  ) {
    this.code = code;
    this.quick = !!opts.quick;
    const hooks = opts.hooks ?? {};
    this.game = new Game(nanoid(10), code, this.quick ? { ...settings, ...QUICK_SETTINGS } : settings, {
      onChange: () => this.scheduleBroadcast(),
      onDice: (d) => this.io.to(this.code).emit('dice', d),
      onSfx: (n) => this.io.to(this.code).emit('sfx', n),
      onEnd: (s) => this.handleEnd(s, hooks),
    });
    this.game.state.quickMatch = this.quick;

    this.timers.push(setInterval(() => this.game.tick(), TICK_MS));
    this.timers.push(setInterval(() => this.runBots(), BOT_TICK_MS));
    if (this.quick) this.later(() => this.fillQuickSeat(), between(QUICK_WAIT_MS));
  }

  private later(fn: () => void, ms: number) {
    const h = setTimeout(() => { this.oneShots.delete(h); fn(); }, ms);
    this.oneShots.add(h);
  }

  dispose() {
    for (const t of this.timers) clearInterval(t);
    for (const t of this.oneShots) clearTimeout(t);
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    this.oneShots.clear();
    if (this.flushHandle) clearTimeout(this.flushHandle);
    this.timers = [];
  }

  get state(): GameState { return this.game.state; }

  /** What clients see: seat fillers look like everyone else. */
  publicState(): GameState {
    const s = this.game.state;
    return { ...s, players: s.players.map((p) => (p.isBot ? { ...p, isBot: false } : p)) };
  }

  private humans(): Player[] {
    return this.state.players.filter((p) => !this.fillers.has(p.id));
  }

  get isEmpty(): boolean {
    return this.humans().filter((p) => p.connected && !this.autopilot.has(p.id)).length === 0;
  }

  /** A Quick Play table that is still gathering players. */
  get isForming(): boolean {
    return this.quick && this.state.status === 'lobby' && this.state.startsAt === null
      && this.state.players.length < QUICK_SIZE;
  }

  summary(): RoomSummary {
    const s = this.state;
    return {
      code: this.code,
      name: s.settings.name,
      players: s.players.length,
      maxPlayers: s.settings.maxPlayers,
      status: s.status,
      hostName: s.players.find((p) => p.isHost)?.name ?? '—',
    };
  }

  /** Coalesces the many small engine mutations of one action into a single frame. */
  private scheduleBroadcast() {
    this.lastActivity = Date.now();
    if (this.flushHandle) return;
    this.flushHandle = setTimeout(() => {
      this.flushHandle = null;
      this.io.to(this.code).emit('state', this.publicState());
    }, BROADCAST_DEBOUNCE_MS);
  }

  broadcast() { this.scheduleBroadcast(); }

  // ---------------------------------------------------------------- seating

  addHuman(opts: { name: string; token?: TokenId; color?: string; userId?: string | null }): Player | null {
    const p = this.game.addPlayer({ name: opts.name, token: opts.token, color: opts.color });
    if (p && opts.userId) this.users.set(p.id, opts.userId);
    // In Quick Play nobody hosts; the table starts itself.
    if (p && this.quick) p.ready = true;
    return p;
  }

  addFiller(): Player | null {
    const taken = new Set(this.state.players.map((p) => p.name.toLowerCase()));
    const p = this.game.addPlayer({ name: fillerName(taken), isBot: true });
    if (!p) return null;
    this.fillers.add(p.id);
    // A random look, so fillers do not always take the first free piece.
    const tokens = ['hat', 'car', 'ship', 'dog', 'boot', 'thimble', 'barrow', 'iron'] as TokenId[];
    const free = tokens.filter((t) => !this.state.players.some((x) => x.token === t));
    const tok = free[Math.floor(Math.random() * free.length)];
    if (tok) p.token = tok;
    // Fillers never host.
    if (p.isHost) {
      const human = this.humans()[0];
      if (human) { p.isHost = false; human.isHost = true; }
    }
    return p;
  }

  private fillQuickSeat() {
    if (!this.quick || this.state.status !== 'lobby' || this.state.startsAt !== null) return;
    if (this.isEmpty) return;
    if (this.state.players.length < QUICK_SIZE) {
      this.addFiller();
      this.broadcast();
    }
    if (this.state.players.length >= QUICK_SIZE) {
      this.state.startsAt = Date.now() + QUICK_COUNTDOWN_MS;
      this.broadcast();
      this.later(() => this.startQuick(), QUICK_COUNTDOWN_MS);
    } else {
      this.later(() => this.fillQuickSeat(), between(QUICK_SEAT_GAP_MS));
    }
  }

  private startQuick() {
    if (this.state.status !== 'lobby') return;
    if (this.isEmpty) return;
    const host = this.humans()[0] ?? this.state.players[0];
    if (host) this.game.start(host.id, true);
  }

  private isAutomated(id: string) { return this.fillers.has(id) || this.autopilot.has(id); }

  private runBots() {
    const s = this.state;
    if (s.status !== 'playing') return;
    const now = Date.now();
    if (now < this.nextBotAt) return;
    for (const p of s.players) {
      if (!this.isAutomated(p.id) || p.bankrupt) continue;
      if (botStep(this.game, p.id)) {
        // People take a moment to think; so do the fillers.
        const quickish = s.turn.phase === 'post-roll' || !!s.drawnCard;
        this.nextBotAt = now + BOT_PACE * (quickish ? 500 + Math.random() * 700 : 900 + Math.random() * 1500);
        break;
      }
    }
  }

  playerIdFor(socketId: string): string | undefined {
    return this.seats.get(socketId);
  }

  userFor(playerId: string): string | undefined {
    return this.users.get(playerId);
  }

  socketsFor(playerId: string): string[] {
    return [...this.seats].filter(([, pid]) => pid === playerId).map(([sid]) => sid);
  }

  seat(socketId: string, playerId: string): string {
    this.seats.set(socketId, playerId);
    let token = this.tokens.get(playerId);
    if (!token) {
      token = nanoid(24);
      this.tokens.set(playerId, token);
    }
    return token;
  }

  /** Reclaims an existing seat after a reload; returns the player id when valid. */
  reclaim(socketId: string, sessionToken: string, userId: string | null): string | null {
    for (const [playerId, token] of this.tokens) {
      if (token !== sessionToken) continue;
      const p = this.game.player(playerId);
      if (!p) return null;
      const owner = this.users.get(playerId);
      if (owner && owner !== userId) return null;
      for (const [sid, pid] of this.seats) if (pid === playerId) this.seats.delete(sid);
      this.seats.set(socketId, playerId);
      this.cancelGrace(playerId);
      this.autopilot.delete(playerId);
      this.game.setConnected(playerId);
      this.broadcast();
      return playerId;
    }
    return null;
  }

  private cancelGrace(playerId: string) {
    const handle = this.graceTimers.get(playerId);
    if (handle) { clearTimeout(handle); this.graceTimers.delete(playerId); }
  }

  /** The reward a player earned, kept so a reload still shows the results. */
  rewardFor(playerId: string): Reward | undefined {
    return this.rewards.get(playerId);
  }

  /**
   * A dropped socket only puts the seat on hold — reloading the page or losing
   * wifi should not cost you your place, or delete the room you just made.
   */
  release(socketId: string) {
    const playerId = this.seats.get(socketId);
    if (!playerId) return;
    this.seats.delete(socketId);
    if (this.socketsFor(playerId).length > 0) return; // another tab still holds the seat
    this.game.setDisconnected(playerId);
    this.cancelGrace(playerId);
    this.graceTimers.set(playerId, setTimeout(() => {
      this.graceTimers.delete(playerId);
      if (this.game.player(playerId)?.connected) return;
      this.dropHuman(playerId);
    }, RECONNECT_GRACE_MS));
  }

  /** An explicit "leave" gives the seat up straight away. */
  leave(socketId: string) {
    const playerId = this.seats.get(socketId);
    if (!playerId) return;
    for (const [sid, pid] of this.seats) if (pid === playerId) this.seats.delete(sid);
    this.cancelGrace(playerId);
    this.tokens.delete(playerId);
    this.dropHuman(playerId);
  }

  private dropHuman(playerId: string) {
    if (this.state.status === 'playing') {
      // The seat stays on the board and plays itself, so the table keeps moving.
      this.autopilot.add(playerId);
      this.game.removePlayer(playerId);
      if (this.isEmpty) this.game.abandon();
    } else {
      this.game.removePlayer(playerId);
      this.users.delete(playerId);
      if (this.state.status === 'lobby') this.tokens.delete(playerId);
    }
    this.broadcast();
  }

  kick(playerId: string) {
    this.cancelGrace(playerId);
    for (const [sid, pid] of this.seats) if (pid === playerId) this.seats.delete(sid);
    this.tokens.delete(playerId);
    this.users.delete(playerId);
    this.fillers.delete(playerId);
    this.game.removePlayer(playerId);
    this.state.players = this.state.players.filter((p) => p.id !== playerId);
    this.broadcast();
  }

  // ---------------------------------------------------------------- results

  private handleEnd(s: GameState, hooks: RoomHooks) {
    this.endedAt = Date.now();
    const order = s.standings ?? [];
    const finished = s.endReason !== 'abandoned';
    for (const p of s.players) {
      if (this.fillers.has(p.id) || this.autopilot.has(p.id)) continue;
      const place = Math.max(0, order.indexOf(p.id));
      const r = matchReward(place, s.players.length, finished);
      const userId = this.users.get(p.id);
      const user = userId && hooks.onReward ? hooks.onReward(userId, r.xp, r.coins, r.won) : null;
      const reward: Reward = { place, players: s.players.length, ...r, user };
      this.rewards.set(p.id, reward);
      for (const sid of this.socketsFor(p.id)) this.io.to(sid).emit('reward', reward);
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout;

  constructor(private io: Server, private hooks: RoomHooks = {}) {
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref();
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 5; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return nanoid(6).toUpperCase();
  }

  create(settings: Partial<RoomSettings>, quick = false): Room {
    const room = new Room(this.io, this.newCode(), settings, { quick, hooks: this.hooks });
    this.rooms.set(room.code, room);
    return room;
  }

  /** A Quick Play table with a free seat, or a fresh one. */
  quickRoom(): Room {
    for (const r of this.rooms.values()) if (r.isForming && !r.isEmpty) return r;
    return this.create({}, true);
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  /** Only public rooms still open to newcomers show up in the browser. */
  list(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => !r.quick && !r.state.settings.isPrivate && r.state.status === 'lobby')
      .filter((r) => r.state.players.length < r.state.settings.maxPlayers)
      .map((r) => r.summary())
      .slice(0, 40);
  }

  stats() {
    let playing = 0;
    for (const r of this.rooms.values()) if (r.state.status === 'playing') playing++;
    return { rooms: this.rooms.size, playing };
  }

  destroy(code: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
  }

  destroyAll() {
    for (const code of [...this.rooms.keys()]) this.destroy(code);
    clearInterval(this.sweeper);
  }

  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.isEmpty && now - room.lastActivity > ABANDON_MS) this.destroy(code);
      else if (room.quick && room.endedAt && now - room.endedAt > ENDED_QUICK_TTL_MS) this.destroy(code);
      else if (room.isEmpty && room.state.status === 'lobby' && now - room.lastActivity > 90_000) this.destroy(code);
    }
  }
}

export type Appearance = { name: string; token: TokenId; color: string };
