/** Level curve shared by the server (rewards) and the client (XP bar). */

/** Total XP needed to reach a level (level 1 starts at 0). */
export const xpForLevel = (level: number): number => 50 * (level - 1) * (level - 1);

export const levelFor = (xp: number): number => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;

/** Progress through the current level, 0..1. */
export function levelProgress(xp: number): { level: number; into: number; span: number; pct: number } {
  const level = levelFor(xp);
  const base = xpForLevel(level);
  const span = xpForLevel(level + 1) - base;
  const into = xp - base;
  return { level, into, span, pct: span > 0 ? into / span : 0 };
}

/** Rewards for finishing a match, by place (0 = winner) out of `players`. */
export function matchReward(place: number, players: number, finished: boolean) {
  const beaten = Math.max(0, players - 1 - place);
  const won = place === 0 && finished;
  return {
    xp: 40 + beaten * 20 + (won ? 40 : 0),
    coins: 10 + beaten * 10 + (won ? 50 : 0),
    won,
  };
}

export interface PublicUser {
  id: string;
  /** name shown at the table */
  name: string;
  /** login name; null for guests */
  username: string | null;
  isGuest: boolean;
  token: string;
  color: string;
  xp: number;
  coins: number;
  games: number;
  wins: number;
}

export interface LeaderRow { name: string; xp: number; wins: number; games: number; token: string; color: string }

export interface MatchReward {
  place: number;
  players: number;
  xp: number;
  coins: number;
  won: boolean;
  /** the user's totals after the reward */
  user: PublicUser | null;
}
