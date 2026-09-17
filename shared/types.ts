/** Types shared by the authoritative server and the React client. */

export type GroupId =
  | 'brown' | 'lightblue' | 'pink' | 'orange'
  | 'red' | 'yellow' | 'green' | 'darkblue'
  | 'railroad' | 'utility';

export type TileType =
  | 'go' | 'street' | 'railroad' | 'utility' | 'chest'
  | 'chance' | 'tax' | 'jail' | 'parking' | 'gotojail';

export interface BaseTile {
  id: number;
  name: string;
}

/** Tiles with no ownership or payment data of their own. */
export interface SimpleTile extends BaseTile {
  type: 'go' | 'chest' | 'chance' | 'jail' | 'parking' | 'gotojail';
}

export interface StreetTile extends BaseTile {
  type: 'street';
  group: Exclude<GroupId, 'railroad' | 'utility'>;
  price: number;
  /** [base, 1house, 2, 3, 4, hotel] */
  rent: [number, number, number, number, number, number];
  houseCost: number;
  mortgage: number;
}

export interface RailroadTile extends BaseTile {
  type: 'railroad';
  group: 'railroad';
  price: number;
  /** rent by number of railroads owned (1-4) */
  rent: [number, number, number, number];
  mortgage: number;
}

export interface UtilityTile extends BaseTile {
  type: 'utility';
  group: 'utility';
  price: number;
  /** dice multiplier for [1 owned, 2 owned] */
  multipliers: [number, number];
  mortgage: number;
}

export interface TaxTile extends BaseTile { type: 'tax'; amount: number }

export type OwnableTile = StreetTile | RailroadTile | UtilityTile;
export type Tile = SimpleTile | OwnableTile | TaxTile;

export const isOwnable = (t: Tile): t is OwnableTile =>
  t.type === 'street' || t.type === 'railroad' || t.type === 'utility';

export type TokenId =
  | 'hat' | 'car' | 'ship' | 'dog'
  | 'boot' | 'thimble' | 'barrow' | 'iron';

export interface Player {
  id: string;
  name: string;
  color: string;
  token: TokenId;
  cash: number;
  position: number;
  inJail: boolean;
  /** turns spent in jail so far (0-3) */
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  connected: boolean;
  isBot: boolean;
  isHost: boolean;
  ready: boolean;
}

export interface PropertyState {
  owner: string | null;
  /** 0-4 houses, 5 = hotel */
  houses: number;
  mortgaged: boolean;
}

export interface RoomSettings {
  name: string;
  isPrivate: boolean;
  maxPlayers: number;
  startingCash: number;
  /** seconds a player gets per turn; 0 disables the timer */
  turnSeconds: number;
  /** unbought properties go to auction instead of being skipped */
  auctions: boolean;
  /** fines and taxes accumulate on Free Parking */
  freeParkingPot: boolean;
  /** double rent on a complete unimproved colour group */
  doubleRentOnFullSet: boolean;
  /** houses must be built evenly across a group */
  evenBuild: boolean;
  /** collect $400 for landing exactly on GO */
  doubleGoSalary: boolean;
  /** owners collect rent while in jail */
  rentInJail: boolean;
  /** house/hotel supply limits (32/12 in the classic rules) */
  limitedHouses: boolean;
  /** the game ends after this many rounds and the richest player wins; 0 = play to the last player */
  maxRounds: number;
}

export type TurnPhase =
  | 'pre-roll'
  | 'awaiting-buy'
  | 'auction'
  | 'post-roll'
  | 'in-debt'
  | 'game-over';

export interface TurnState {
  playerId: string;
  phase: TurnPhase;
  dice: [number, number] | null;
  /** consecutive doubles this turn */
  doubles: number;
  rolled: boolean;
  /** epoch ms the current phase expires, or null when untimed */
  deadline: number | null;
}

export interface BuyPrompt {
  tileId: number;
  price: number;
}

export interface AuctionState {
  tileId: number;
  highBid: number;
  highBidder: string | null;
  /** players still allowed to bid */
  active: string[];
  deadline: number;
}

export interface DebtState {
  debtorId: string;
  /** null when the money is owed to the bank */
  creditorId: string | null;
  amount: number;
  reason: string;
}

export interface TradeSide {
  cash: number;
  properties: number[];
  jailCards: number;
}

export interface TradeOffer {
  id: string;
  from: string;
  to: string;
  give: TradeSide;
  want: TradeSide;
  status: 'open' | 'accepted' | 'declined' | 'cancelled';
  createdAt: number;
}

export type LogKind =
  | 'system' | 'roll' | 'move' | 'buy' | 'rent' | 'card'
  | 'jail' | 'build' | 'mortgage' | 'trade' | 'auction'
  | 'bankrupt' | 'tax' | 'win';

export interface LogEntry {
  id: string;
  t: number;
  kind: LogKind;
  text: string;
  playerId?: string;
  tileId?: number;
}

export interface ChatMessage {
  id: string;
  t: number;
  playerId: string;
  name: string;
  color: string;
  text: string;
}

/** A moment every player at the table is told about. */
export interface Announcement {
  id: string;
  kind: LogKind;
  tone: 'good' | 'bad' | 'info';
  text: string;
  playerId?: string;
  tileId?: number;
}

/** A card that has been drawn and is waiting to be acknowledged/animated. */
export interface DrawnCard {
  deck: 'chance' | 'chest';
  cardId: string;
  text: string;
  playerId: string;
}

export interface GameState {
  roomId: string;
  code: string;
  settings: RoomSettings;
  status: 'lobby' | 'playing' | 'ended';
  players: Player[];
  /** keyed by tile id, only ownable tiles present */
  properties: Record<number, PropertyState>;
  turn: TurnState;
  order: string[];
  round: number;
  pot: number;
  housesLeft: number;
  hotelsLeft: number;
  buyPrompt: BuyPrompt | null;
  auction: AuctionState | null;
  debt: DebtState | null;
  drawnCard: DrawnCard | null;
  trades: TradeOffer[];
  log: LogEntry[];
  chat: ChatMessage[];
  winnerId: string | null;
  /** player ids from first place to last, filled in when the game ends */
  standings: string[] | null;
  /** why the game ended */
  endReason: 'bankrupt' | 'rounds' | 'abandoned' | null;
  /** true for tables made by Quick Play */
  quickMatch: boolean;
  /** epoch ms the game starts, while a Quick Play countdown is running */
  startsAt: number | null;
}

export interface RoomSummary {
  code: string;
  name: string;
  players: number;
  maxPlayers: number;
  status: GameState['status'];
  hostName: string;
}

export interface JoinResult {
  ok: boolean;
  error?: string;
  state?: GameState;
  playerId?: string;
  /** secret used to reclaim this seat after a disconnect */
  sessionToken?: string;
  /** set on rejoin when the game already ended and this seat earned a reward */
  reward?: import('./progress').MatchReward;
}

/** Dice animation payload — the server picks the values, clients animate to them. */
export interface DiceThrow {
  values: [number, number];
  /** shared seed so every client tumbles the dice identically */
  seed: number;
  playerId: string;
}

export interface ClientToServer {
  'room:list': (cb: (rooms: RoomSummary[]) => void) => void;
  'room:create': (
    p: { name: string; token: TokenId; color: string; settings: Partial<RoomSettings> },
    cb: (r: JoinResult) => void
  ) => void;
  'room:join': (
    p: { code: string; name: string; token: TokenId; color: string },
    cb: (r: JoinResult) => void
  ) => void;
  'room:rejoin': (p: { code: string; sessionToken: string }, cb: (r: JoinResult) => void) => void;
  /** Quick Play: seat me at the next table that is filling up. */
  'match:join': (p: { name: string; token: TokenId; color: string }, cb: (r: JoinResult) => void) => void;
  'room:leave': () => void;
  'room:settings': (p: Partial<RoomSettings>) => void;
  'room:ready': (p: { ready: boolean }) => void;
  'room:appearance': (p: { token?: TokenId; color?: string; name?: string }) => void;
  'room:addBot': () => void;
  'room:kick': (p: { playerId: string }) => void;
  'room:start': () => void;

  'game:roll': () => void;
  'game:buy': () => void;
  'game:declineBuy': () => void;
  'game:endTurn': () => void;
  'game:build': (p: { tileId: number }) => void;
  'game:sellHouse': (p: { tileId: number }) => void;
  'game:mortgage': (p: { tileId: number }) => void;
  'game:unmortgage': (p: { tileId: number }) => void;
  'game:payJail': () => void;
  'game:useJailCard': () => void;
  'game:rollJail': () => void;
  'game:bid': (p: { amount: number }) => void;
  'game:passBid': () => void;
  'game:bankrupt': () => void;
  'game:acknowledgeCard': () => void;

  'trade:offer': (p: { to: string; give: TradeSide; want: TradeSide }) => void;
  'trade:respond': (p: { id: string; accept: boolean }) => void;
  'trade:cancel': (p: { id: string }) => void;

  'chat:send': (p: { text: string }) => void;
}

export interface ServerToClient {
  'state': (s: GameState) => void;
  'dice': (d: DiceThrow) => void;
  'notice': (m: string) => void;
  'kicked': () => void;
  'sfx': (name: string) => void;
  /** XP and coins earned, sent to each player when a game ends */
  'reward': (r: import('./progress').MatchReward) => void;
  /** a big moment (a purchase, someone sent to Lockup…) shown to everyone */
  'announce': (a: Announcement) => void;
  /** players online right now, for the home screen */
  'online': (n: number) => void;
}
