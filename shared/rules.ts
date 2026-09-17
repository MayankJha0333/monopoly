import { BOARD, GROUP_MEMBERS, tile } from './board';
import type { GameState, OwnableTile, Player, PropertyState, StreetTile } from './types';
import { isOwnable } from './types';

export const prop = (s: GameState, id: number): PropertyState =>
  s.properties[id] ?? { owner: null, houses: 0, mortgaged: false };

export const player = (s: GameState, id: string | null): Player | undefined =>
  s.players.find((p) => p.id === id);

export const activePlayers = (s: GameState): Player[] => s.players.filter((p) => !p.bankrupt);

export function ownedIds(s: GameState, playerId: string): number[] {
  return Object.keys(s.properties)
    .map(Number)
    .filter((id) => s.properties[id]!.owner === playerId);
}

export function ownsWholeGroup(s: GameState, playerId: string, group: string): boolean {
  const members = GROUP_MEMBERS[group] ?? [];
  return members.length > 0 && members.every((id) => prop(s, id).owner === playerId);
}

export const countInGroup = (s: GameState, playerId: string, group: string): number =>
  (GROUP_MEMBERS[group] ?? []).filter((id) => prop(s, id).owner === playerId).length;

/**
 * Rent owed for landing on `tileId`.
 * `multiplier` carries the Chance card cases: 2x railroad rent, or a forced
 * 10x utility roll (passed as multiplier 10 with the utility's own rate ignored).
 */
export function rentFor(
  s: GameState,
  tileId: number,
  diceTotal: number,
  multiplier = 1,
  forcedUtilityRate = 0,
): number {
  const t = tile(tileId);
  if (!isOwnable(t)) return 0;
  const st = prop(s, tileId);
  if (!st.owner || st.mortgaged) return 0;

  const owner = player(s, st.owner);
  if (owner?.inJail && !s.settings.rentInJail) return 0;

  if (t.type === 'street') {
    const street = t as StreetTile;
    if (st.houses > 0) return street.rent[st.houses]! * multiplier;
    const base = street.rent[0]!;
    const doubled = s.settings.doubleRentOnFullSet && ownsWholeGroup(s, st.owner, street.group);
    return base * (doubled ? 2 : 1) * multiplier;
  }

  if (t.type === 'railroad') {
    const owned = countInGroup(s, st.owner, 'railroad');
    if (owned === 0) return 0;
    return t.rent[owned - 1]! * multiplier;
  }

  const owned = countInGroup(s, st.owner, 'utility');
  const rate = forcedUtilityRate || t.multipliers[owned >= 2 ? 1 : 0]!;
  return rate * diceTotal * multiplier;
}

export function netWorth(s: GameState, playerId: string): number {
  const p = player(s, playerId);
  if (!p) return 0;
  let total = p.cash;
  for (const id of ownedIds(s, playerId)) {
    const t = tile(id) as OwnableTile;
    const st = prop(s, id);
    total += st.mortgaged ? 0 : t.price;
    if (t.type === 'street') total += st.houses * (t as StreetTile).houseCost;
  }
  return total;
}

/** Cash a player could raise right now by mortgaging and selling buildings. */
export function liquidValue(s: GameState, playerId: string): number {
  const p = player(s, playerId);
  if (!p) return 0;
  let total = p.cash;
  for (const id of ownedIds(s, playerId)) {
    const t = tile(id) as OwnableTile;
    const st = prop(s, id);
    if (!st.mortgaged) total += t.mortgage;
    if (t.type === 'street') total += st.houses * ((t as StreetTile).houseCost / 2);
  }
  return total;
}

export interface Check { ok: boolean; reason?: string }
const no = (reason: string): Check => ({ ok: false, reason });
const yes: Check = { ok: true };

export function canBuild(s: GameState, playerId: string, tileId: number): Check {
  const t = tile(tileId);
  if (t.type !== 'street') return no('Only streets can be improved.');
  const st = prop(s, tileId);
  if (st.owner !== playerId) return no('You do not own this street.');
  if (!ownsWholeGroup(s, playerId, t.group)) return no('You need the full colour set.');
  if (st.houses >= 5) return no('Already has a hotel.');

  const members = GROUP_MEMBERS[t.group]!;
  if (members.some((id) => prop(s, id).mortgaged)) return no('Unmortgage the whole set first.');

  if (s.settings.evenBuild) {
    const min = Math.min(...members.map((id) => prop(s, id).houses));
    if (st.houses > min) return no('Houses must be built evenly.');
  }
  if (s.settings.limitedHouses) {
    if (st.houses === 4 && s.hotelsLeft <= 0) return no('The bank has no hotels left.');
    if (st.houses < 4 && s.housesLeft <= 0) return no('The bank has no houses left.');
  }
  const p = player(s, playerId)!;
  if (p.cash < t.houseCost) return no(`You need $${t.houseCost}.`);
  return yes;
}

export function canSellHouse(s: GameState, playerId: string, tileId: number): Check {
  const t = tile(tileId);
  if (t.type !== 'street') return no('Nothing to sell here.');
  const st = prop(s, tileId);
  if (st.owner !== playerId) return no('You do not own this street.');
  if (st.houses <= 0) return no('No buildings to sell.');

  if (s.settings.evenBuild) {
    const members = GROUP_MEMBERS[t.group]!;
    const max = Math.max(...members.map((id) => prop(s, id).houses));
    if (st.houses < max) return no('Sell evenly across the set.');
  }
  // Breaking a hotel needs 4 houses back from the bank.
  if (st.houses === 5 && s.settings.limitedHouses && s.housesLeft < 4) {
    return no('The bank has too few houses to break the hotel.');
  }
  return yes;
}

export function canMortgage(s: GameState, playerId: string, tileId: number): Check {
  const t = tile(tileId);
  if (!isOwnable(t)) return no('Not a property.');
  const st = prop(s, tileId);
  if (st.owner !== playerId) return no('You do not own this.');
  if (st.mortgaged) return no('Already mortgaged.');
  if (t.type === 'street') {
    const members = GROUP_MEMBERS[t.group]!;
    if (members.some((id) => prop(s, id).houses > 0)) return no('Sell the buildings first.');
  }
  return yes;
}

export function canUnmortgage(s: GameState, playerId: string, tileId: number): Check {
  const t = tile(tileId);
  if (!isOwnable(t)) return no('Not a property.');
  const st = prop(s, tileId);
  if (st.owner !== playerId) return no('You do not own this.');
  if (!st.mortgaged) return no('Not mortgaged.');
  const p = player(s, playerId)!;
  if (p.cash < unmortgageCost(t)) return no(`You need $${unmortgageCost(t)}.`);
  return yes;
}

/** Mortgage value plus the standard 10% interest. */
export const unmortgageCost = (t: OwnableTile): number => Math.round(t.mortgage * 1.1);

export const buildingsOf = (s: GameState, playerId: string) =>
  ownedIds(s, playerId).reduce(
    (acc, id) => {
      const h = prop(s, id).houses;
      if (h === 5) acc.hotels += 1;
      else acc.houses += h;
      return acc;
    },
    { houses: 0, hotels: 0 },
  );

export const groupsOwnedBy = (s: GameState, playerId: string): string[] =>
  Object.keys(GROUP_MEMBERS).filter((g) => ownsWholeGroup(s, playerId, g));

export const nextOwnableOfType = (from: number, kind: 'railroad' | 'utility'): number => {
  for (let i = 1; i <= BOARD.length; i++) {
    const id = (from + i) % BOARD.length;
    if (tile(id).type === kind) return id;
  }
  return from;
};

export const money = (n: number): string =>
  (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
