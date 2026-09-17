/**
 * Accounts, sessions and the round cap. Run with `npm run test:auth`.
 */
import { AuthStore, hashPassword, parseCookies, verifyPassword } from './auth';
import { openDb } from './db';
import { Game } from './engine';
import { botStep } from './bot';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

// Passwords
const h = hashPassword('sunny1234');
check('hash is not the password', !h.includes('sunny1234'));
check('right password verifies', verifyPassword('sunny1234', h));
check('wrong password fails', !verifyPassword('sunny12345', h));
check('missing hash fails', !verifyPassword('anything', null));
check('two hashes of one password differ', hashPassword('sunny1234') !== h);

// Accounts
const store = new AuthStore(openDb(':memory:'));
const guest = store.createGuest('  Beach <b>Kid</b>  ', 'car', '#3aa0e8');
check('guest name is cleaned', guest.display_name === 'Beach bKid/b', guest.display_name);
check('guest keeps piece and colour', guest.token === 'car' && guest.color === '#3aa0e8');
store.addMatch(guest.id, 120, 40, true);
const upgraded = store.register('Mayank_01', 'm@example.com', 'sunny1234', guest.id);
check('sign-up upgrades the guest row', upgraded.id === guest.id && upgraded.is_guest === 0);
check('upgrade keeps earned XP and wins', upgraded.xp === 120 && upgraded.wins === 1);
check('username clash is detected case-insensitively', store.taken('mayank_01', 'x@y.com') === 'username');
check('email clash is detected', store.taken('someone', 'M@example.com') === 'email');
check('login by username', store.byLogin('mayank_01')?.id === guest.id);
check('login by email', store.byLogin('M@Example.com')?.id === guest.id);

const token = store.newSession(guest.id);
check('session resolves to the user', store.userForSession(token)?.id === guest.id);
check('a made-up session does not', !store.userForSession('nope'));
store.endSession(token);
check('logout ends the session', !store.userForSession(token));

check('leaderboard lists members with games', store.leaderboard().some((r) => r.name === 'Mayank_01'));
check('cookie parsing', parseCookies('a=1; sp_sid=abc%3D; b')['sp_sid'] === 'abc=');

// Round cap: the richest player wins when time runs out.
const game = new Game('t', 'TEST1', { turnSeconds: 0, maxRounds: 3 });
let ended = 0;
(game as unknown as { hooks: { onEnd: () => void } }).hooks.onEnd = () => { ended++; };
for (let i = 0; i < 4; i++) game.addPlayer({ name: `P${i}`, isBot: true });
game.start(game.state.players[0]!.id, true);
let steps = 0;
while (game.state.status === 'playing' && steps++ < 20_000) {
  let acted = false;
  for (const p of game.state.players) if (!p.bankrupt && botStep(game, p.id)) { acted = true; break; }
  if (!acted) game.autoPlayStuckTurn();
}
check('capped game ends', game.state.status === 'ended', `round ${game.state.round}`);
check('it ends on the cap', game.state.round <= 3);
check('standings list every player', game.state.standings?.length === 4);
check('winner is first in the standings', game.state.standings?.[0] === game.state.winnerId);
check('end hook fires once', ended === 1, String(ended));

console.log(failed ? `\n${failed} check(s) failed` : '\nall auth checks passed');
process.exit(failed ? 1 : 0);
