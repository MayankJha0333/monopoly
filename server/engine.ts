import { nanoid } from 'nanoid';
import {
  BOARD, GO_SALARY, GROUP_MEMBERS, JAIL_FINE, JAIL_POSITION,
  PLAYER_COLORS, TOKENS, TOTAL_HOTELS, TOTAL_HOUSES, tile,
} from '@shared/board';
import { CHANCE, CHEST, card, shuffledIds, type Card } from '@shared/cards';
import {
  canBuild, canMortgage, canSellHouse, canUnmortgage, liquidValue, money, netWorth,
  nextOwnableOfType, ownedIds, prop, rentFor, unmortgageCost,
} from '@shared/rules';
import type {
  DiceThrow, GameState, LogEntry, LogKind, OwnableTile, Player, RoomSettings,
  StreetTile, TokenId, TradeSide,
} from '@shared/types';
import { isOwnable } from '@shared/types';

export const DEFAULT_SETTINGS: RoomSettings = {
  name: 'Sunnyport table',
  isPrivate: true,
  maxPlayers: 6,
  startingCash: 1500,
  turnSeconds: 90,
  auctions: true,
  freeParkingPot: false,
  doubleRentOnFullSet: true,
  evenBuild: true,
  doubleGoSalary: false,
  rentInJail: true,
  limitedHouses: true,
  maxRounds: 0,
};

const BOOL_KEYS = [
  'isPrivate', 'auctions', 'freeParkingPot', 'doubleRentOnFullSet', 'evenBuild',
  'doubleGoSalary', 'rentInJail', 'limitedHouses',
] as const;
const NUM_KEYS = ['maxPlayers', 'startingCash', 'turnSeconds', 'maxRounds'] as const;

/** Keeps only known settings with the right types and sane ranges. */
export function cleanSettings(raw: unknown, base: RoomSettings = DEFAULT_SETTINGS, seated = 0): RoomSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const next: RoomSettings = { ...base };
  for (const k of BOOL_KEYS) if (typeof src[k] === 'boolean') next[k] = src[k] as boolean;
  for (const k of NUM_KEYS) {
    const v = Number(src[k]);
    if (src[k] !== undefined && src[k] !== null && src[k] !== '' && Number.isFinite(v)) next[k] = v;
  }
  if (typeof src.name === 'string') next.name = src.name;
  next.maxPlayers = Math.min(8, Math.max(seated, 2, Math.round(next.maxPlayers)));
  next.startingCash = Math.min(50_000, Math.max(500, Math.round(next.startingCash / 50) * 50));
  next.turnSeconds = Math.min(600, Math.max(0, Math.round(next.turnSeconds)));
  next.maxRounds = Math.min(200, Math.max(0, Math.round(next.maxRounds)));
  next.name = String(next.name).replace(/[<>]/g, '').trim().slice(0, 32) || 'Sunnyport table';
  return next;
}

const AUCTION_SECONDS = 15;
/** Once everyone else has passed, the last bidder gets a short window. */
const LAST_BIDDER_SECONDS = 5;
const MAX_LOG = 250;
const MAX_CHAT = 120;

export interface EngineHooks {
  onDice?: (d: DiceThrow) => void;
  onSfx?: (name: string) => void;
  onChange?: () => void;
  /** fired for every log line, so the room can announce the big moments */
  onLog?: (entry: LogEntry) => void;
  /** fired once, when the game reaches 'ended' */
  onEnd?: (state: GameState) => void;
}

const d6 = () => 1 + Math.floor(Math.random() * 6);

export class Game {
  state: GameState;
  private chanceDeck: string[] = [];
  private chestDeck: string[] = [];
  private hooks: EngineHooks;
  /** Guards moveBack -> land -> card recursion. */
  private landDepth = 0;
  /** player ids in the order they went bankrupt */
  private outOrder: string[] = [];

  constructor(roomId: string, code: string, settings: Partial<RoomSettings>, hooks: EngineHooks = {}) {
    this.hooks = hooks;
    this.state = {
      roomId,
      code,
      settings: cleanSettings(settings),
      status: 'lobby',
      players: [],
      properties: {},
      turn: { playerId: '', phase: 'pre-roll', dice: null, doubles: 0, rolled: false, deadline: null },
      order: [],
      round: 0,
      pot: 0,
      housesLeft: TOTAL_HOUSES,
      hotelsLeft: TOTAL_HOTELS,
      buyPrompt: null,
      auction: null,
      debt: null,
      drawnCard: null,
      trades: [],
      log: [],
      chat: [],
      winnerId: null,
      standings: null,
      endReason: null,
      quickMatch: false,
      startsAt: null,
    };
    for (const t of BOARD) {
      if (isOwnable(t)) this.state.properties[t.id] = { owner: null, houses: 0, mortgaged: false };
    }
  }

  // ---------------------------------------------------------------- utilities

  private changed() { this.hooks.onChange?.(); }
  private sfx(name: string) { this.hooks.onSfx?.(name); }

  log(kind: LogKind, text: string, playerId?: string, tileId?: number) {
    const entry: LogEntry = { id: nanoid(8), t: Date.now(), kind, text, playerId, tileId };
    this.state.log.push(entry);
    this.hooks.onLog?.(entry);
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);
  }

  player(id: string | null | undefined): Player | undefined {
    return this.state.players.find((p) => p.id === id);
  }

  private active(): Player[] { return this.state.players.filter((p) => !p.bankrupt); }

  current(): Player | undefined { return this.player(this.state.turn.playerId); }

  private name(id: string | null | undefined): string {
    return this.player(id)?.name ?? 'The bank';
  }

  // ------------------------------------------------------------------- lobby

  freeToken(): TokenId {
    const taken = new Set(this.state.players.map((p) => p.token));
    return (TOKENS.find((t) => !taken.has(t.id as TokenId))?.id ?? 'hat') as TokenId;
  }

  freeColor(): string {
    const taken = new Set(this.state.players.map((p) => p.color));
    return PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0]!;
  }

  addPlayer(opts: { name: string; token?: TokenId; color?: string; isBot?: boolean }): Player | null {
    if (this.state.players.length >= this.state.settings.maxPlayers) return null;
    if (this.state.status !== 'lobby') return null;

    const taken = new Set(this.state.players.map((p) => p.token));
    const colours = new Set(this.state.players.map((p) => p.color));
    const p: Player = {
      id: nanoid(10),
      name: opts.name.slice(0, 16) || 'Player',
      color: opts.color && !colours.has(opts.color) ? opts.color : this.freeColor(),
      token: opts.token && !taken.has(opts.token) ? opts.token : this.freeToken(),
      cash: this.state.settings.startingCash,
      position: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      connected: true,
      isBot: !!opts.isBot,
      isHost: this.state.players.length === 0,
      ready: !!opts.isBot,
    };
    this.state.players.push(p);
    this.log('system', `${p.name} joined the room.`, p.id);
    this.changed();
    return p;
  }

  /** Marks a player offline. Their seat is held until the room drops them. */
  setDisconnected(playerId: string) {
    const p = this.player(playerId);
    if (!p || !p.connected) return;
    p.connected = false;
    this.log('system', `${p.name} lost connection.`, p.id);
    if (this.state.status === 'playing' && this.state.turn.playerId === playerId) {
      this.autoPlayStuckTurn();
    }
    this.changed();
  }

  setConnected(playerId: string) {
    const p = this.player(playerId);
    if (!p || p.connected) return;
    p.connected = true;
    this.log('system', `${p.name} reconnected.`, p.id);
    this.changed();
  }

  /** Removes a player for good: they left, were kicked, or never came back. */
  removePlayer(playerId: string) {
    const p = this.player(playerId);
    if (!p) return;

    if (this.state.status === 'lobby') {
      this.state.players = this.state.players.filter((x) => x.id !== playerId);
      if (p.isHost && this.state.players[0]) this.state.players[0].isHost = true;
      this.log('system', `${p.name} left the room.`);
    } else {
      // Mid-game the seat stays on the board; the player just plays no more.
      p.connected = false;
      this.log('system', `${p.name} left the game.`, p.id);
      if (this.state.turn.playerId === playerId && this.state.status === 'playing') {
        this.autoPlayStuckTurn();
      }
    }
    this.changed();
  }

  setAppearance(playerId: string, patch: { token?: TokenId; color?: string; name?: string }) {
    const p = this.player(playerId);
    if (!p || this.state.status !== 'lobby') return;
    if (patch.name) p.name = patch.name.slice(0, 16);
    if (patch.token && !this.state.players.some((x) => x.id !== playerId && x.token === patch.token)) {
      p.token = patch.token;
    }
    if (patch.color && !this.state.players.some((x) => x.id !== playerId && x.color === patch.color)) {
      p.color = patch.color;
    }
    this.changed();
  }

  setReady(playerId: string, ready: boolean) {
    const p = this.player(playerId);
    if (!p) return;
    p.ready = ready;
    this.changed();
  }

  updateSettings(playerId: string, patch: Partial<RoomSettings>) {
    const p = this.player(playerId);
    if (!p?.isHost || this.state.status !== 'lobby') return;
    const s = this.state.settings;
    const next = cleanSettings(patch, s, this.state.players.length);
    this.state.settings = next;
    if (next.startingCash !== s.startingCash) {
      for (const pl of this.state.players) pl.cash = next.startingCash;
    }
    this.changed();
  }

  start(playerId: string, force = false): string | null {
    const p = this.player(playerId);
    if (!force && !p?.isHost) return 'Only the host can start the game.';
    if (this.state.status !== 'lobby') return 'The game has already started.';
    if (this.state.players.length < 2) return 'You need at least two players.';
    if (!force && this.state.players.some((x) => !x.ready && !x.isHost)) return 'Not everyone is ready.';
    this.state.startsAt = null;

    this.chanceDeck = shuffledIds(CHANCE);
    this.chestDeck = shuffledIds(CHEST);
    this.state.order = this.state.players.map((x) => x.id).sort(() => Math.random() - 0.5);
    this.state.status = 'playing';
    this.state.round = 1;
    this.log('system', 'The game has begun. Good luck!');
    this.beginTurn(this.state.order[0]!);
    return null;
  }

  // -------------------------------------------------------------------- turns

  private beginTurn(playerId: string) {
    const p = this.player(playerId);
    if (!p) return;
    this.state.turn = {
      playerId,
      phase: 'pre-roll',
      dice: null,
      doubles: 0,
      rolled: false,
      deadline: this.deadline(),
    };
    this.state.buyPrompt = null;
    this.state.drawnCard = null;
    this.state.debt = null;
    this.log('system', `${p.name}'s turn.`, p.id);
    this.changed();
  }

  private deadline(seconds = this.state.settings.turnSeconds): number | null {
    return seconds > 0 ? Date.now() + seconds * 1000 : null;
  }

  nextTurn() {
    const order = this.state.order.filter((id) => !this.player(id)?.bankrupt);
    if (order.length <= 1) return this.finish(order[0] ?? null);

    const idx = order.indexOf(this.state.turn.playerId);
    const next = order[(idx + 1) % order.length]!;
    if (idx >= 0 && (idx + 1) % order.length === 0) {
      this.state.round += 1;
      const cap = this.state.settings.maxRounds;
      if (cap > 0 && this.state.round > cap) {
        this.state.round = cap;
        return this.finishOnWorth();
      }
      if (cap > 0 && this.state.round === cap) {
        this.log('system', 'Final round! The richest player wins when it ends.');
      }
    }
    this.beginTurn(next);
  }

  /** Round limit reached: rank everyone still in by net worth. */
  finishOnWorth() {
    const alive = this.active()
      .map((p) => ({ id: p.id, worth: netWorth(this.state, p.id) }))
      .sort((a, b) => b.worth - a.worth);
    this.finish(alive[0]?.id ?? null, 'rounds');
  }

  private finish(winnerId: string | null, reason: 'bankrupt' | 'rounds' | 'abandoned' = 'bankrupt') {
    if (this.state.status === 'ended') return;
    const alive = this.active()
      .map((p) => ({ id: p.id, worth: netWorth(this.state, p.id) }))
      .sort((a, b) => b.worth - a.worth)
      .map((x) => x.id);
    if (winnerId) {
      const i = alive.indexOf(winnerId);
      if (i > 0) { alive.splice(i, 1); alive.unshift(winnerId); }
    }
    this.state.standings = [...alive, ...[...this.outOrder].reverse()];
    this.state.status = 'ended';
    this.state.endReason = reason;
    this.state.winnerId = winnerId;
    this.state.turn.phase = 'game-over';
    this.state.turn.deadline = null;
    this.state.auction = null;
    this.state.buyPrompt = null;
    const worth = winnerId ? netWorth(this.state, winnerId) : 0;
    this.log(
      'win',
      winnerId
        ? reason === 'rounds'
          ? `Time's up! ${this.name(winnerId)} wins with ${money(worth)} in total wealth.`
          : `${this.name(winnerId)} wins the game!`
        : 'Game over.',
      winnerId ?? undefined,
    );
    this.sfx('win');
    this.changed();
    this.hooks.onEnd?.(this.state);
  }

  /** Ends a game nobody is playing any more (all humans left). */
  abandon() {
    if (this.state.status !== 'playing') return;
    const alive = this.active()
      .map((p) => ({ id: p.id, worth: netWorth(this.state, p.id) }))
      .sort((a, b) => b.worth - a.worth);
    this.finish(alive[0]?.id ?? null, 'abandoned');
  }

  endTurn(playerId: string): string | null {
    const t = this.state.turn;
    if (t.playerId !== playerId) return 'It is not your turn.';
    if (t.phase === 'in-debt') return 'Settle your debt first.';
    if (t.phase === 'awaiting-buy' || t.phase === 'auction') return 'Finish the current decision first.';
    if (t.phase === 'pre-roll' && !t.rolled) return 'You have to roll first.';
    this.nextTurn();
    return null;
  }

  // --------------------------------------------------------------------- dice

  roll(playerId: string): string | null {
    const t = this.state.turn;
    const p = this.player(playerId);
    if (!p) return 'Unknown player.';
    if (t.playerId !== playerId) return 'It is not your turn.';
    if (t.phase !== 'pre-roll') return 'You cannot roll right now.';

    const values: [number, number] = [d6(), d6()];
    const isDouble = values[0] === values[1];
    const total = values[0] + values[1];
    t.dice = values;
    t.rolled = true;
    this.throwDice(values, playerId);

    if (p.inJail) {
      this.resolveJailRoll(p, isDouble, total);
      return null;
    }

    if (isDouble) {
      t.doubles += 1;
      if (t.doubles >= 3) {
        this.log('roll', `${p.name} rolled a third double and is sent to Lockup.`, p.id);
        this.sendToJail(p);
        t.phase = 'post-roll';
        this.changed();
        return null;
      }
    } else {
      t.doubles = 0;
    }

    this.log('roll', `${p.name} rolled ${values[0]} and ${values[1]}${isDouble ? ' (double)' : ''}.`, p.id);
    this.advance(p, total);
    return null;
  }

  private throwDice(values: [number, number], playerId: string) {
    this.hooks.onDice?.({ values, seed: Math.floor(Math.random() * 1e9), playerId });
    this.sfx('dice');
  }

  private resolveJailRoll(p: Player, isDouble: boolean, total: number) {
    const t = this.state.turn;
    if (isDouble) {
      p.inJail = false;
      p.jailTurns = 0;
      this.log('jail', `${p.name} rolled doubles and is out of Lockup.`, p.id);
      this.sfx('unlock');
      t.doubles = 0; // a doubles roll out of jail does not grant another turn
      this.advance(p, total);
      return;
    }

    p.jailTurns += 1;
    if (p.jailTurns >= 3) {
      this.log('jail', `${p.name} failed three times and pays the ${money(JAIL_FINE)} fine.`, p.id);
      p.inJail = false;
      p.jailTurns = 0;
      if (this.charge(p.id, JAIL_FINE, null, 'Lockup fine')) this.advance(p, total);
      else t.phase = 'in-debt';
    } else {
      this.log('jail', `${p.name} stays in Lockup (attempt ${p.jailTurns} of 3).`, p.id);
      t.phase = 'post-roll';
      this.changed();
    }
  }

  // ----------------------------------------------------------------- movement

  private advance(p: Player, steps: number) {
    const from = p.position;
    const to = (from + steps + BOARD.length) % BOARD.length;
    if (steps > 0 && to <= from) this.passGo(p);
    p.position = to;
    this.sfx('step');
    this.land(p);
  }

  private jumpTo(p: Player, tileId: number, collectGo = true) {
    if (collectGo && tileId < p.position) this.passGo(p);
    p.position = tileId;
    this.land(p);
  }

  private passGo(p: Player) {
    p.cash += GO_SALARY;
    this.log('move', `${p.name} passed Start and collected ${money(GO_SALARY)}.`, p.id);
    this.sfx('cash');
  }

  private sendToJail(p: Player) {
    p.position = JAIL_POSITION;
    p.inJail = true;
    p.jailTurns = 0;
    this.state.turn.doubles = 0;
    this.log('jail', `${p.name} is sent to Lockup.`, p.id, JAIL_POSITION);
    this.sfx('jail');
  }

  /** Resolves whatever the player has landed on. */
  private land(p: Player, multiplier = 1, forcedUtilityRate = 0) {
    if (this.landDepth > 4) return this.afterAction(p);
    this.landDepth += 1;
    try {
      const t = tile(p.position);
      const dice = this.state.turn.dice;
      const total = dice ? dice[0] + dice[1] : 0;

      switch (t.type) {
        case 'go': {
          if (this.state.settings.doubleGoSalary) {
            p.cash += GO_SALARY;
            this.log('move', `${p.name} landed on Start and collects a double salary.`, p.id);
          }
          return this.afterAction(p);
        }
        case 'street':
        case 'railroad':
        case 'utility':
          return this.landOnOwnable(p, t, total, multiplier, forcedUtilityRate);
        case 'tax': {
          this.log('tax', `${p.name} pays ${money(t.amount)} in ${t.name}.`, p.id, t.id);
          if (this.state.settings.freeParkingPot) this.state.pot += t.amount;
          if (!this.charge(p.id, t.amount, null, t.name)) return;
          return this.afterAction(p);
        }
        case 'chance':
        case 'chest':
          return this.drawCard(p, t.type === 'chance' ? 'chance' : 'chest');
        case 'gotojail': {
          this.sendToJail(p);
          this.state.turn.phase = 'post-roll';
          this.changed();
          return;
        }
        case 'parking': {
          if (this.state.settings.freeParkingPot && this.state.pot > 0) {
            p.cash += this.state.pot;
            this.log('move', `${p.name} collects ${money(this.state.pot)} from Beach Break.`, p.id);
            this.state.pot = 0;
            this.sfx('cash');
          }
          return this.afterAction(p);
        }
        default:
          return this.afterAction(p);
      }
    } finally {
      this.landDepth -= 1;
    }
  }

  private landOnOwnable(
    p: Player, t: OwnableTile, total: number, multiplier: number, forcedUtilityRate: number,
  ) {
    const st = prop(this.state, t.id);

    if (!st.owner) {
      if (p.cash >= t.price) {
        this.state.buyPrompt = { tileId: t.id, price: t.price };
        this.state.turn.phase = 'awaiting-buy';
        this.state.turn.deadline = this.deadline(Math.min(30, this.state.settings.turnSeconds || 30));
        this.changed();
        return;
      }
      if (this.state.settings.auctions) return this.startAuction(t.id);
      this.log('system', `${p.name} cannot afford ${t.name}.`, p.id, t.id);
      return this.afterAction(p);
    }

    if (st.owner === p.id) return this.afterAction(p);
    if (st.mortgaged) {
      this.log('rent', `${t.name} is mortgaged — no rent is due.`, p.id, t.id);
      return this.afterAction(p);
    }

    // The 10x utility card re-throws the dice, per the classic rules.
    let diceTotal = total;
    if (forcedUtilityRate > 0 && t.type === 'utility') {
      const values: [number, number] = [d6(), d6()];
      diceTotal = values[0] + values[1];
      this.state.turn.dice = values;
      this.throwDice(values, p.id);
    }

    const rent = rentFor(this.state, t.id, diceTotal, multiplier, forcedUtilityRate);
    if (rent <= 0) return this.afterAction(p);

    const owner = this.player(st.owner)!;
    this.log('rent', `${p.name} pays ${money(rent)} rent to ${owner.name} for ${t.name}.`, p.id, t.id);
    this.sfx('cash');
    if (!this.charge(p.id, rent, owner.id, `Rent for ${t.name}`)) return;
    return this.afterAction(p);
  }

  /** Called once a landing has fully resolved — decides whether the player rolls again. */
  private afterAction(p: Player) {
    const t = this.state.turn;
    if (this.state.status !== 'playing') return;
    if (t.playerId !== p.id) return;
    if (t.phase === 'in-debt' || t.phase === 'auction' || t.phase === 'awaiting-buy') return;

    if (t.doubles > 0 && !p.inJail && !p.bankrupt) {
      t.phase = 'pre-roll';
      t.rolled = false;
      t.deadline = this.deadline();
      this.log('system', `${p.name} rolled doubles and goes again.`, p.id);
    } else {
      t.phase = 'post-roll';
      t.deadline = this.deadline();
    }
    this.changed();
  }

  // -------------------------------------------------------------------- cards

  private drawCard(p: Player, deck: 'chance' | 'chest') {
    const pile = deck === 'chance' ? this.chanceDeck : this.chestDeck;
    if (pile.length === 0) {
      const refill = shuffledIds(deck === 'chance' ? CHANCE : CHEST);
      pile.push(...refill);
    }
    const id = pile.shift()!;
    const c = card(id);
    this.state.drawnCard = { deck, cardId: id, text: c.text, playerId: p.id };
    this.log('card', `${p.name} drew: ${c.text}`, p.id);
    this.sfx('card');
    this.applyCard(p, c);
    // A Get Out of Jail Free card is kept, so it goes back to the bottom later.
    if (c.action.type !== 'jailcard') pile.push(id);
    this.changed();
  }

  private applyCard(p: Player, c: Card) {
    const a = c.action;
    switch (a.type) {
      case 'move':
        return this.jumpTo(p, a.to, true);
      case 'moveBack': {
        p.position = (p.position - a.spaces + BOARD.length) % BOARD.length;
        return this.land(p);
      }
      case 'nearest': {
        const target = nextOwnableOfType(p.position, a.kind);
        if (target < p.position) this.passGo(p);
        p.position = target;
        return this.land(p, a.kind === 'railroad' ? 2 : 1, a.kind === 'utility' ? 10 : 0);
      }
      case 'collect': {
        p.cash += a.amount;
        this.sfx('cash');
        return this.afterAction(p);
      }
      case 'pay': {
        if (this.state.settings.freeParkingPot) this.state.pot += a.amount;
        if (!this.charge(p.id, a.amount, null, c.text)) return;
        return this.afterAction(p);
      }
      case 'collectEach': {
        let taken = 0;
        for (const other of this.active()) {
          if (other.id === p.id) continue;
          const amt = Math.min(other.cash, a.amount);
          other.cash -= amt;
          taken += amt;
        }
        p.cash += taken;
        this.log('card', `${p.name} collects ${money(taken)} from the other players.`, p.id);
        this.sfx('cash');
        return this.afterAction(p);
      }
      case 'payEach': {
        const others = this.active().filter((o) => o.id !== p.id);
        const owed = a.amount * others.length;
        if (p.cash >= owed) {
          for (const o of others) o.cash += a.amount;
          p.cash -= owed;
          this.log('card', `${p.name} pays ${money(owed)} to the other players.`, p.id);
          return this.afterAction(p);
        }
        // Not enough cash: pay the first creditor and let the debt flow handle it.
        if (!this.charge(p.id, owed, others[0]?.id ?? null, c.text)) return;
        return this.afterAction(p);
      }
      case 'repairs': {
        let owed = 0;
        for (const id of ownedIds(this.state, p.id)) {
          const h = prop(this.state, id).houses;
          owed += h === 5 ? a.hotel : h * a.house;
        }
        if (owed === 0) return this.afterAction(p);
        this.log('card', `${p.name} owes ${money(owed)} for repairs.`, p.id);
        if (this.state.settings.freeParkingPot) this.state.pot += owed;
        if (!this.charge(p.id, owed, null, 'Repairs')) return;
        return this.afterAction(p);
      }
      case 'jailcard': {
        p.jailCards += 1;
        return this.afterAction(p);
      }
      case 'gotojail': {
        this.sendToJail(p);
        this.state.turn.phase = 'post-roll';
        this.changed();
        return;
      }
    }
  }

  acknowledgeCard(playerId: string) {
    if (this.state.drawnCard?.playerId === playerId) {
      this.state.drawnCard = null;
      this.changed();
    }
  }

  // ------------------------------------------------------------ buy & auction

  buy(playerId: string): string | null {
    const bp = this.state.buyPrompt;
    const p = this.player(playerId);
    if (!bp || !p) return 'Nothing to buy.';
    if (this.state.turn.playerId !== playerId) return 'It is not your turn.';

    const t = tile(bp.tileId) as OwnableTile;
    if (p.cash < bp.price) return 'You cannot afford that.';

    p.cash -= bp.price;
    this.state.properties[t.id] = { owner: p.id, houses: 0, mortgaged: false };
    this.state.buyPrompt = null;
    this.state.turn.phase = 'post-roll';
    this.log('buy', `${p.name} bought ${t.name} for ${money(bp.price)}.`, p.id, t.id);
    this.sfx('buy');
    this.afterAction(p);
    return null;
  }

  declineBuy(playerId: string): string | null {
    const bp = this.state.buyPrompt;
    const p = this.player(playerId);
    if (!bp || !p) return 'Nothing to decline.';
    if (this.state.turn.playerId !== playerId) return 'It is not your turn.';

    this.state.buyPrompt = null;
    this.state.turn.phase = 'post-roll';
    if (this.state.settings.auctions) {
      this.startAuction(bp.tileId);
    } else {
      this.log('system', `${p.name} passed on ${tile(bp.tileId).name}.`, p.id, bp.tileId);
      this.afterAction(p);
    }
    return null;
  }

  private startAuction(tileId: number) {
    const bidders = this.active().map((p) => p.id);
    if (bidders.length === 0) return;
    this.state.auction = {
      tileId,
      highBid: 0,
      highBidder: null,
      active: bidders,
      deadline: Date.now() + AUCTION_SECONDS * 1000,
    };
    this.state.turn.phase = 'auction';
    this.state.turn.deadline = null;
    this.log('auction', `${tile(tileId).name} goes to auction.`, undefined, tileId);
    this.sfx('gavel');
    this.changed();
  }

  bid(playerId: string, amount: number): string | null {
    const a = this.state.auction;
    const p = this.player(playerId);
    if (!a || !p) return 'No auction running.';
    if (!a.active.includes(playerId)) return 'You have passed on this auction.';
    const value = Math.floor(amount);
    if (!Number.isFinite(value) || value <= a.highBid) return `Bid must beat ${money(a.highBid)}.`;
    if (value > p.cash) return 'You cannot bid more than your cash.';

    a.highBid = value;
    a.highBidder = playerId;
    a.deadline = Date.now() + AUCTION_SECONDS * 1000;
    this.log('auction', `${p.name} bids ${money(value)}.`, p.id, a.tileId);
    this.changed();
    return null;
  }

  passBid(playerId: string): string | null {
    const a = this.state.auction;
    const p = this.player(playerId);
    if (!a || !p) return 'No auction running.';
    if (!a.active.includes(playerId)) return null;

    a.active = a.active.filter((id) => id !== playerId);
    this.log('auction', `${p.name} passes.`, p.id, a.tileId);

    const onlyBidderLeft = a.active.length === 1 && a.active[0] === a.highBidder;
    if (a.active.length === 0 || onlyBidderLeft) {
      this.resolveAuction();
      return null;
    }
    // With one bidder left there is nothing to out-bid, so do not make the
    // table sit through the full clock.
    if (a.active.length === 1) {
      a.deadline = Math.min(a.deadline, Date.now() + LAST_BIDDER_SECONDS * 1000);
    }
    this.changed();
    return null;
  }

  private resolveAuction() {
    const a = this.state.auction;
    if (!a) return;
    const t = tile(a.tileId) as OwnableTile;

    if (a.highBidder && a.highBid > 0) {
      const winner = this.player(a.highBidder)!;
      winner.cash -= a.highBid;
      this.state.properties[a.tileId] = { owner: winner.id, houses: 0, mortgaged: false };
      this.log('auction', `${winner.name} wins ${t.name} for ${money(a.highBid)}.`, winner.id, a.tileId);
      this.sfx('gavel');
    } else {
      this.log('auction', `Nobody bid on ${t.name}. It stays with the bank.`, undefined, a.tileId);
    }

    this.state.auction = null;
    const cur = this.current();
    if (cur) {
      this.state.turn.phase = 'post-roll';
      this.state.turn.deadline = this.deadline();
      this.afterAction(cur);
    }
    this.changed();
  }

  // ------------------------------------------------------------------ economy

  /**
   * Moves money, or opens a debt the player has to resolve.
   * Returns true when the payment completed immediately.
   */
  private charge(debtorId: string, amount: number, creditorId: string | null, reason: string): boolean {
    const p = this.player(debtorId);
    if (!p || amount <= 0) return true;

    if (p.cash >= amount) {
      p.cash -= amount;
      if (creditorId) {
        const c = this.player(creditorId);
        if (c) c.cash += amount;
      }
      return true;
    }

    this.state.debt = { debtorId, creditorId, amount, reason };
    this.state.turn.phase = 'in-debt';
    this.state.turn.deadline = null;
    this.log('system', `${p.name} owes ${money(amount)} (${reason}) and must raise cash.`, p.id);
    this.changed();
    return false;
  }

  /** Settles an open debt as soon as the debtor has enough cash. */
  private trySettleDebt() {
    const d = this.state.debt;
    if (!d) return;
    const p = this.player(d.debtorId);
    if (!p) return;
    if (p.cash < d.amount) return;

    p.cash -= d.amount;
    if (d.creditorId) {
      const c = this.player(d.creditorId);
      if (c) c.cash += d.amount;
    }
    this.log('system', `${p.name} settled a debt of ${money(d.amount)}.`, p.id);
    this.state.debt = null;
    if (this.state.turn.playerId === p.id) {
      this.state.turn.phase = 'post-roll';
      this.state.turn.deadline = this.deadline();
      this.afterAction(p);
    }
    this.changed();
  }

  declareBankrupt(playerId: string): string | null {
    const p = this.player(playerId);
    if (!p || p.bankrupt) return 'Nothing to do.';
    const d = this.state.debt;
    if (d && d.debtorId !== playerId) return 'You have no debt to resign from.';
    // Outside of a forced debt, resigning is always allowed.
    this.bankrupt(p, d?.creditorId ? this.player(d.creditorId) ?? null : null);
    return null;
  }

  private bankrupt(p: Player, creditor: Player | null) {
    const owned = ownedIds(this.state, p.id);

    if (creditor) {
      creditor.cash += p.cash;
      creditor.jailCards += p.jailCards;
      for (const id of owned) {
        const st = this.state.properties[id]!;
        const t = tile(id);
        // Buildings are always sold back to the bank; the cash goes to the creditor.
        if (t.type === 'street' && st.houses > 0) {
          const refund = st.houses * ((t as StreetTile).houseCost / 2);
          creditor.cash += refund;
          this.returnBuildings(st.houses);
          st.houses = 0;
        }
        st.owner = creditor.id;
      }
      this.log('bankrupt', `${p.name} is bankrupt. Everything passes to ${creditor.name}.`, p.id);
    } else {
      for (const id of owned) {
        const st = this.state.properties[id]!;
        if (st.houses > 0) this.returnBuildings(st.houses);
        this.state.properties[id] = { owner: null, houses: 0, mortgaged: false };
      }
      this.log('bankrupt', `${p.name} is bankrupt. Their property returns to the bank.`, p.id);
    }

    p.cash = 0;
    p.jailCards = 0;
    p.bankrupt = true;
    if (!this.outOrder.includes(p.id)) this.outOrder.push(p.id);
    p.inJail = false;
    this.state.debt = null;
    this.state.trades = this.state.trades.filter((t) => t.from !== p.id && t.to !== p.id);
    if (this.state.auction) {
      this.state.auction.active = this.state.auction.active.filter((id) => id !== p.id);
    }
    this.sfx('bankrupt');

    const remaining = this.active();
    if (remaining.length <= 1) return this.finish(remaining[0]?.id ?? null, 'bankrupt');
    if (this.state.turn.playerId === p.id) this.nextTurn();
    else this.changed();
  }

  private returnBuildings(houses: number) {
    if (houses === 5) this.state.hotelsLeft = Math.min(TOTAL_HOTELS, this.state.hotelsLeft + 1);
    else this.state.housesLeft = Math.min(TOTAL_HOUSES, this.state.housesLeft + houses);
  }

  // ---------------------------------------------------------------- buildings

  build(playerId: string, tileId: number): string | null {
    const check = canBuild(this.state, playerId, tileId);
    if (!check.ok) return check.reason!;
    const t = tile(tileId) as StreetTile;
    const st = this.state.properties[tileId]!;
    const p = this.player(playerId)!;

    p.cash -= t.houseCost;
    st.houses += 1;
    if (st.houses === 5) {
      this.state.hotelsLeft -= 1;
      this.state.housesLeft = Math.min(TOTAL_HOUSES, this.state.housesLeft + 4);
      this.log('build', `${p.name} built a hotel on ${t.name}.`, p.id, tileId);
    } else {
      this.state.housesLeft -= 1;
      this.log('build', `${p.name} built a house on ${t.name}.`, p.id, tileId);
    }
    this.sfx('build');
    this.changed();
    return null;
  }

  sellHouse(playerId: string, tileId: number): string | null {
    const check = canSellHouse(this.state, playerId, tileId);
    if (!check.ok) return check.reason!;
    const t = tile(tileId) as StreetTile;
    const st = this.state.properties[tileId]!;
    const p = this.player(playerId)!;

    if (st.houses === 5) {
      st.houses = 4;
      this.state.hotelsLeft += 1;
      this.state.housesLeft -= 4;
    } else {
      st.houses -= 1;
      this.state.housesLeft += 1;
    }
    p.cash += t.houseCost / 2;
    this.log('build', `${p.name} sold a building on ${t.name} for ${money(t.houseCost / 2)}.`, p.id, tileId);
    this.trySettleDebt();
    this.changed();
    return null;
  }

  mortgage(playerId: string, tileId: number): string | null {
    const check = canMortgage(this.state, playerId, tileId);
    if (!check.ok) return check.reason!;
    const t = tile(tileId) as OwnableTile;
    this.state.properties[tileId]!.mortgaged = true;
    const p = this.player(playerId)!;
    p.cash += t.mortgage;
    this.log('mortgage', `${p.name} mortgaged ${t.name} for ${money(t.mortgage)}.`, p.id, tileId);
    this.trySettleDebt();
    this.changed();
    return null;
  }

  unmortgage(playerId: string, tileId: number): string | null {
    const check = canUnmortgage(this.state, playerId, tileId);
    if (!check.ok) return check.reason!;
    const t = tile(tileId) as OwnableTile;
    const cost = unmortgageCost(t);
    const p = this.player(playerId)!;
    p.cash -= cost;
    this.state.properties[tileId]!.mortgaged = false;
    this.log('mortgage', `${p.name} lifted the mortgage on ${t.name} for ${money(cost)}.`, p.id, tileId);
    this.changed();
    return null;
  }

  // --------------------------------------------------------------------- jail

  payJail(playerId: string): string | null {
    const p = this.player(playerId);
    if (!p?.inJail) return 'You are not in Lockup.';
    if (this.state.turn.playerId !== playerId) return 'It is not your turn.';
    if (this.state.turn.rolled) return 'You already rolled this turn.';
    if (p.cash < JAIL_FINE) return 'You cannot afford the fine.';

    p.cash -= JAIL_FINE;
    p.inJail = false;
    p.jailTurns = 0;
    this.log('jail', `${p.name} paid the ${money(JAIL_FINE)} fine and left Lockup.`, p.id);
    this.sfx('unlock');
    this.changed();
    return null;
  }

  useJailCard(playerId: string): string | null {
    const p = this.player(playerId);
    if (!p?.inJail) return 'You are not in Lockup.';
    if (p.jailCards <= 0) return 'You have no Free Pass.';
    if (this.state.turn.playerId !== playerId) return 'It is not your turn.';

    p.jailCards -= 1;
    p.inJail = false;
    p.jailTurns = 0;
    this.log('jail', `${p.name} used a Free Pass.`, p.id);
    this.sfx('unlock');
    this.changed();
    return null;
  }

  // -------------------------------------------------------------------- trade

  private validSide(playerId: string, side: TradeSide): boolean {
    const p = this.player(playerId);
    if (!p) return false;
    if (side.cash < 0 || side.cash > p.cash) return false;
    if (side.jailCards < 0 || side.jailCards > p.jailCards) return false;
    return side.properties.every((id) => {
      const st = this.state.properties[id];
      if (!st || st.owner !== playerId) return false;
      // Streets carrying buildings cannot change hands.
      return st.houses === 0;
    });
  }

  offerTrade(from: string, to: string, give: TradeSide, want: TradeSide): string | null {
    if (from === to) return 'You cannot trade with yourself.';
    const a = this.player(from);
    const b = this.player(to);
    if (!a || !b || a.bankrupt || b.bankrupt) return 'That player is not available.';
    if (this.state.status !== 'playing') return 'The game is not running.';
    if (!this.validSide(from, give)) return 'You cannot offer that.';
    if (!this.validSide(to, want)) return 'They cannot give that.';
    if (this.state.trades.filter((t) => t.from === from && t.status === 'open').length >= 3) {
      return 'You already have three offers open.';
    }

    this.state.trades.push({
      id: nanoid(8), from, to, give, want, status: 'open', createdAt: Date.now(),
    });
    this.log('trade', `${a.name} sent a trade offer to ${b.name}.`, from);
    this.sfx('trade');
    this.changed();
    return null;
  }

  respondTrade(playerId: string, tradeId: string, accept: boolean): string | null {
    const t = this.state.trades.find((x) => x.id === tradeId);
    if (!t || t.status !== 'open') return 'That offer is no longer open.';
    if (t.to !== playerId) return 'That offer is not addressed to you.';

    if (!accept) {
      t.status = 'declined';
      this.log('trade', `${this.name(playerId)} declined the offer.`, playerId);
      this.changed();
      return null;
    }

    if (!this.validSide(t.from, t.give) || !this.validSide(t.to, t.want)) {
      t.status = 'cancelled';
      this.changed();
      return 'The offer is no longer valid.';
    }

    const a = this.player(t.from)!;
    const b = this.player(t.to)!;
    a.cash += t.want.cash - t.give.cash;
    b.cash += t.give.cash - t.want.cash;
    a.jailCards += t.want.jailCards - t.give.jailCards;
    b.jailCards += t.give.jailCards - t.want.jailCards;
    for (const id of t.give.properties) this.state.properties[id]!.owner = b.id;
    for (const id of t.want.properties) this.state.properties[id]!.owner = a.id;

    t.status = 'accepted';
    this.log('trade', `${a.name} and ${b.name} agreed a trade.`, a.id);
    this.sfx('trade');
    this.trySettleDebt();
    this.changed();
    return null;
  }

  cancelTrade(playerId: string, tradeId: string): string | null {
    const t = this.state.trades.find((x) => x.id === tradeId);
    if (!t || t.status !== 'open') return null;
    if (t.from !== playerId) return 'That is not your offer.';
    t.status = 'cancelled';
    this.changed();
    return null;
  }

  // --------------------------------------------------------------------- chat

  chat(playerId: string, text: string) {
    const p = this.player(playerId);
    const clean = text.trim().slice(0, 240);
    if (!p || !clean) return;
    this.state.chat.push({
      id: nanoid(8), t: Date.now(), playerId: p.id, name: p.name, color: p.color, text: clean,
    });
    if (this.state.chat.length > MAX_CHAT) this.state.chat.shift();
    this.changed();
  }

  // ------------------------------------------------------------------- timers

  /** Drives auction and turn deadlines. Called on a fixed interval by the room. */
  tick(now = Date.now()) {
    if (this.state.status !== 'playing') return;

    if (this.state.auction && now >= this.state.auction.deadline) {
      this.resolveAuction();
      return;
    }

    const t = this.state.turn;
    if (t.deadline && now >= t.deadline) this.autoPlayStuckTurn();
  }

  /** Takes the safest legal action for a player who has run out of time or left. */
  autoPlayStuckTurn() {
    const t = this.state.turn;
    const p = this.current();
    if (!p || this.state.status !== 'playing') return;

    switch (t.phase) {
      case 'pre-roll':
        this.roll(p.id);
        break;
      case 'awaiting-buy':
        this.declineBuy(p.id);
        break;
      case 'post-roll':
        this.nextTurn();
        break;
      case 'in-debt':
        this.autoRaiseOrResign(p);
        break;
      default:
        break;
    }
  }

  /** Mortgages and sells buildings to cover a debt, resigning only if it is unpayable. */
  autoRaiseOrResign(p: Player) {
    const d = this.state.debt;
    if (!d || d.debtorId !== p.id) return;

    if (liquidValue(this.state, p.id) < d.amount) {
      this.bankrupt(p, d.creditorId ? this.player(d.creditorId) ?? null : null);
      return;
    }

    // Sell buildings first, then mortgage, cheapest sets last.
    let guard = 0;
    while (p.cash < d.amount && guard++ < 120) {
      const owned = ownedIds(this.state, p.id);
      const sellable = owned.filter((id) => canSellHouse(this.state, p.id, id).ok);
      if (sellable.length > 0) {
        sellable.sort((a, b) => prop(this.state, b).houses - prop(this.state, a).houses);
        this.sellHouse(p.id, sellable[0]!);
        continue;
      }
      const mortgageable = owned.filter((id) => canMortgage(this.state, p.id, id).ok);
      if (mortgageable.length === 0) break;
      mortgageable.sort((a, b) => (tile(a) as OwnableTile).mortgage - (tile(b) as OwnableTile).mortgage);
      this.mortgage(p.id, mortgageable[0]!);
    }

    if (p.cash >= d.amount) this.trySettleDebt();
    else this.bankrupt(p, d.creditorId ? this.player(d.creditorId) ?? null : null);
  }

  /** Public view of the state — identical for every client, no hidden data. */
  snapshot(): GameState {
    return this.state;
  }
}

export { GROUP_MEMBERS };
