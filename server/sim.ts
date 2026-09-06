/**
 * Headless rule check: runs full bot-only games and asserts the engine's
 * invariants after every decision. Run with `npm run sim [games]`.
 */
import { TOTAL_HOTELS, TOTAL_HOUSES } from '@shared/board';
import { botStep } from './bot';
import { Game } from './engine';

const GAMES = Number(process.argv[2] ?? 150);
let decided = 0, draws = 0, stalls = 0, totalSteps = 0, longest = 0;
const problems: string[] = [];

for (let g = 0; g < GAMES; g++) {
  const game = new Game('sim', 'SIMUL', { turnSeconds: 0, maxPlayers: 4 });
  for (let i = 0; i < 4; i++) game.addPlayer({ name: `Bot ${i + 1}`, isBot: true });
  const err = game.start(game.state.players[0]!.id);
  if (err) { problems.push(`start failed: ${err}`); break; }

  let steps = 0, idle = 0;
  while (game.state.status === 'playing' && steps < 60_000) {
    let acted = false;
    for (const p of game.state.players) {
      if (p.bankrupt) continue;
      if (botStep(game, p.id)) { acted = true; break; }
    }
    steps++;

    if (acted) { idle = 0; } else {
      idle++;
      game.autoPlayStuckTurn();
      if (idle > 8) {
        stalls++;
        problems.push(`stall phase=${game.state.turn.phase} debt=${!!game.state.debt} auction=${!!game.state.auction}`);
        break;
      }
    }

    const s = game.state;
    for (const p of s.players) {
      if (p.cash < 0) problems.push(`negative cash (${p.cash})`);
      if (p.position < 0 || p.position > 39) problems.push(`position out of range (${p.position})`);
      if (p.bankrupt && p.cash !== 0) problems.push('bankrupt player holding cash');
    }
    if (s.housesLeft < 0 || s.housesLeft > TOTAL_HOUSES) problems.push(`housesLeft=${s.housesLeft}`);
    if (s.hotelsLeft < 0 || s.hotelsLeft > TOTAL_HOTELS) problems.push(`hotelsLeft=${s.hotelsLeft}`);
    for (const [id, st] of Object.entries(s.properties)) {
      if (st.houses < 0 || st.houses > 5) problems.push(`tile ${id} houses=${st.houses}`);
      if (st.houses > 0 && st.mortgaged) problems.push(`tile ${id} mortgaged while built`);
      if (st.houses > 0 && !st.owner) problems.push(`tile ${id} built but unowned`);
    }
    if (problems.length > 12) break;
  }

  totalSteps += steps;
  longest = Math.max(longest, game.state.round);
  if (game.state.status === 'ended') { if (game.state.winnerId) decided++; else draws++; }
  if (problems.length > 12) break;
}

console.log(`games=${GAMES}  decided=${decided}  draws=${draws}  stalls=${stalls}`);
console.log(`avg decisions/game=${Math.round(totalSteps / GAMES)}  longest=${longest} rounds`);
console.log(problems.length ? `PROBLEMS:\n  ${[...new Set(problems)].join('\n  ')}` : 'invariants: OK');
process.exit(problems.length || stalls ? 1 : 0);
