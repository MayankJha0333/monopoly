import { GROUP_MEMBERS, tile } from '@shared/board';
import { canBuild, countInGroup, ownedIds, prop } from '@shared/rules';
import type { GameState, OwnableTile, StreetTile, TradeOffer } from '@shared/types';
import type { Game } from './engine';

/** Cash a bot tries to keep in hand; it loosens up as the game goes on. */
const reserve = (s: GameState) => (s.round < 4 ? 120 : s.round < 10 ? 200 : 320);

/** How much a bot values owning a tile, relative to its list price. */
function appetite(s: GameState, playerId: string, tileId: number): number {
  const t = tile(tileId) as OwnableTile;
  const group = t.group;
  const members = GROUP_MEMBERS[group] ?? [];
  const mine = countInGroup(s, playerId, group);
  const unowned = members.filter((id) => !prop(s, id).owner).length;

  let score = 1;
  if (t.type === 'railroad') score += 0.25 * mine;
  else if (t.type === 'utility') score -= 0.25;
  else {
    // Completing or nearly completing a colour set is where the game is won.
    if (mine === members.length - 1) score += 0.9;
    else if (mine > 0) score += 0.35;
    // Orange and red see the most traffic coming out of jail.
    if (group === 'orange' || group === 'red') score += 0.2;
    if (group === 'brown' || group === 'lightblue') score -= 0.1;
  }
  // Denying an opponent the last tile of a set is worth paying for.
  const opponentClose = members.some((id) => {
    const owner = prop(s, id).owner;
    return owner && owner !== playerId && countInGroup(s, owner, group) === members.length - 1;
  });
  if (opponentClose && unowned > 0) score += 0.4;
  return score;
}

function valueOf(s: GameState, playerId: string, ids: number[]): number {
  return ids.reduce((sum, id) => {
    const t = tile(id) as OwnableTile;
    const st = prop(s, id);
    const base = st.mortgaged ? t.mortgage : t.price;
    return sum + base * appetite(s, playerId, id);
  }, 0);
}

function bestBuildTarget(s: GameState, playerId: string): number | null {
  const candidates = ownedIds(s, playerId)
    .filter((id) => canBuild(s, playerId, id).ok)
    .sort((a, b) => {
      const ta = tile(a) as StreetTile;
      const tb = tile(b) as StreetTile;
      // Prefer the cheaper build that unlocks the bigger rent jump.
      const gainA = ta.rent[prop(s, a).houses + 1]! - ta.rent[prop(s, a).houses]!;
      const gainB = tb.rent[prop(s, b).houses + 1]! - tb.rent[prop(s, b).houses]!;
      return gainB / tb.houseCost - gainA / ta.houseCost;
    });
  return candidates[0] ?? null;
}

function judgeTrade(s: GameState, botId: string, offer: TradeOffer): boolean {
  const incoming = valueOf(s, botId, offer.give.properties) + offer.give.cash + offer.give.jailCards * 50;
  const outgoing = valueOf(s, botId, offer.want.properties) + offer.want.cash + offer.want.jailCards * 50;
  if (outgoing === 0) return incoming > 0;

  // Never hand over the tile that completes someone else's colour set.
  const handsOverMonopoly = offer.want.properties.some((id) => {
    const t = tile(id) as OwnableTile;
    const members = GROUP_MEMBERS[t.group] ?? [];
    const theirs = members.filter((m) => {
      const owner = prop(s, m).owner;
      return owner === offer.from || offer.give.properties.includes(m);
    }).length;
    return theirs + 1 >= members.length && t.type === 'street';
  });

  const gainsMonopoly = offer.give.properties.some((id) => {
    const t = tile(id) as OwnableTile;
    if (t.type !== 'street') return false;
    const members = GROUP_MEMBERS[t.group] ?? [];
    const mine = members.filter(
      (m) => prop(s, m).owner === botId || offer.give.properties.includes(m),
    ).length;
    return mine >= members.length;
  });

  const bot = s.players.find((p) => p.id === botId);
  if (bot && offer.want.cash > bot.cash - 50) return false;

  const ratio = incoming / outgoing;
  // Completing someone's set is only worth it for a mutual swap or a real premium.
  if (handsOverMonopoly) return gainsMonopoly ? ratio > 0.8 : ratio > 2.2;
  return gainsMonopoly ? ratio > 0.85 : ratio > 1.15;
}

/** Tiles that would finish a colour set for `playerId`, and who currently holds them. */
function missingForSet(s: GameState, playerId: string): { tileId: number; owner: string }[] {
  const out: { tileId: number; owner: string }[] = [];
  for (const [group, members] of Object.entries(GROUP_MEMBERS)) {
    if (group === 'railroad' || group === 'utility') continue;
    const mine = members.filter((id) => prop(s, id).owner === playerId);
    if (mine.length !== members.length - 1) continue;
    const gap = members.find((id) => prop(s, id).owner !== playerId);
    if (gap === undefined) continue;
    const owner = prop(s, gap).owner;
    if (owner && owner !== playerId && prop(s, gap).houses === 0) out.push({ tileId: gap, owner });
  }
  return out;
}

/** Throttles proposals so a bot does not re-offer the same swap every tick. */
const lastOffer = new Map<string, number>();
const OFFER_COOLDOWN_MS = 20_000;

/**
 * Looks for a trade worth proposing. Mutual set-completing swaps come first
 * because both sides accept them; otherwise the bot pays a cash premium.
 */
function tryPropose(game: Game, botId: string): boolean {
  const s = game.state;
  const bot = s.players.find((p) => p.id === botId)!;
  const wants = missingForSet(s, botId);
  if (wants.length === 0) return false;

  for (const want of wants) {
    const key = `${botId}:${want.tileId}`;
    const last = lastOffer.get(key) ?? 0;
    if (Date.now() - last < OFFER_COOLDOWN_MS) continue;

    const target = s.players.find((p) => p.id === want.owner);
    if (!target || target.bankrupt) continue;
    const wantTile = tile(want.tileId) as OwnableTile;

    // Does the other side need something the bot happens to hold?
    const theirGaps = missingForSet(s, want.owner).filter((x) => x.owner === botId);
    const sweetener = theirGaps[0]?.tileId;

    let cash = 0;
    const give: number[] = [];
    if (sweetener !== undefined) {
      give.push(sweetener);
      const diff = wantTile.price - (tile(sweetener) as OwnableTile).price;
      cash = Math.max(0, Math.min(bot.cash - 100, Math.round(diff + wantTile.price * 0.3)));
    } else {
      cash = Math.round(wantTile.price * 1.9);
      if (cash > bot.cash - 150) continue; // cannot afford a convincing premium
    }

    lastOffer.set(key, Date.now());
    const err = game.offerTrade(
      botId, want.owner,
      { cash, properties: give, jailCards: 0 },
      { cash: 0, properties: [want.tileId], jailCards: 0 },
    );
    if (!err) return true;
  }
  return false;
}

/**
 * Runs one bot decision. The room calls this repeatedly on a timer so the bot
 * appears to think, and so a single call never cascades through a whole turn.
 */
export function botStep(game: Game, botId: string): boolean {
  const s = game.state;
  const bot = game.player(botId);
  if (!bot || bot.bankrupt || s.status !== 'playing') return false;

  // Answer any pending trade offers first, whoever's turn it is.
  const offer = s.trades.find((t) => t.status === 'open' && t.to === botId);
  if (offer) {
    game.respondTrade(botId, offer.id, judgeTrade(s, botId, offer));
    return true;
  }

  if (s.auction && s.auction.active.includes(botId)) {
    const t = tile(s.auction.tileId) as OwnableTile;
    const ceiling = Math.min(bot.cash - 25, Math.round(t.price * appetite(s, botId, t.id) * 0.9));
    const next = s.auction.highBid + Math.max(10, Math.round(t.price * 0.05));
    if (s.auction.highBidder !== botId && next <= ceiling) game.bid(botId, next);
    else game.passBid(botId);
    return true;
  }

  if (s.debt?.debtorId === botId) {
    game.autoRaiseOrResign(bot);
    return true;
  }

  if (s.drawnCard?.playerId === botId) {
    game.acknowledgeCard(botId);
    return true;
  }

  if (s.turn.playerId !== botId) return false;

  switch (s.turn.phase) {
    case 'pre-roll': {
      if (bot.inJail) {
        const heavilyInvested = ownedIds(s, botId).length >= 3;
        if (bot.jailCards > 0) game.useJailCard(botId);
        else if (heavilyInvested && bot.cash > 250 && bot.jailTurns > 0) game.payJail(botId);
      }
      game.roll(botId);
      return true;
    }

    case 'awaiting-buy': {
      const bp = s.buyPrompt;
      if (!bp) return false;
      const want = appetite(s, botId, bp.tileId);
      const affordable = bot.cash - bp.price >= reserve(s) * (want > 1.4 ? 0.4 : 1);
      if (affordable || want >= 1.8) game.buy(botId);
      else game.declineBuy(botId);
      return true;
    }

    case 'post-roll': {
      const target = bestBuildTarget(s, botId);
      if (target !== null && bot.cash > reserve(s) + (tile(target) as StreetTile).houseCost) {
        game.build(botId, target);
        return true;
      }
      // Lift mortgages once comfortable, so rent starts flowing again.
      const mortgaged = ownedIds(s, botId).find((id) => prop(s, id).mortgaged);
      if (mortgaged !== undefined && bot.cash > reserve(s) + 250) {
        game.unmortgage(botId, mortgaged);
        return true;
      }
      if (tryPropose(game, botId)) return true;
      game.endTurn(botId);
      return true;
    }

    default:
      return false;
  }
}
