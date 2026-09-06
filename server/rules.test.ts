/**
 * Focused checks on the rules that are easy to get subtly wrong.
 * Run with `npm run test:rules`.
 */
import { GROUP_MEMBERS } from '@shared/board';
import { canBuild, canMortgage, netWorth, rentFor } from '@shared/rules';
import { Game } from './engine';

const failures: string[] = [];
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

/** A started two-player game with deterministic ownership helpers. */
function table() {
  const game = new Game('t', 'RULES', { turnSeconds: 0, startingCash: 5000 });
  const a = game.addPlayer({ name: 'A' })!;
  const b = game.addPlayer({ name: 'B' })!;
  game.setReady(b.id, true);
  game.start(a.id);
  const own = (tileId: number, playerId: string, houses = 0, mortgaged = false) => {
    game.state.properties[tileId] = { owner: playerId, houses, mortgaged };
  };
  return { game, a, b, own };
}

// --- rent ------------------------------------------------------------------
{
  const { game, a, b, own } = table();
  const brown = GROUP_MEMBERS['brown']!; // Mediterranean(1) $2, Baltic(3) $4

  own(1, a.id);
  check('single street charges base rent', rentFor(game.state, 1, 7) === 2);

  own(3, a.id);
  check('full unimproved set doubles rent', rentFor(game.state, 1, 7) === 4, `got ${rentFor(game.state, 1, 7)}`);

  game.state.properties[1]!.houses = 1;
  check('one house uses the house rent, not doubled base', rentFor(game.state, 1, 7) === 10);

  game.state.properties[1]!.houses = 5;
  check('hotel rent is the top row', rentFor(game.state, 1, 7) === 250);

  game.state.properties[1]!.houses = 0;
  game.state.properties[1]!.mortgaged = true;
  check('mortgaged property charges nothing', rentFor(game.state, 1, 7) === 0);

  game.state.properties[1]!.mortgaged = false;
  own(3, b.id);
  check('a broken set charges base rent again', rentFor(game.state, 1, 7) === 2);
  check('brown group has two members', brown.length === 2);
}

// --- railroads and utilities ----------------------------------------------
{
  const { game, a, own } = table();
  own(5, a.id);
  check('one railroad charges $25', rentFor(game.state, 5, 7) === 25);
  own(15, a.id); own(25, a.id);
  check('three railroads charge $100', rentFor(game.state, 5, 7) === 100);
  own(35, a.id);
  check('four railroads charge $200', rentFor(game.state, 5, 7) === 200);
  check('the Chance card doubles railroad rent', rentFor(game.state, 5, 7, 2) === 400);

  own(12, a.id);
  check('one utility charges 4x the dice', rentFor(game.state, 12, 9) === 36);
  own(28, a.id);
  check('both utilities charge 10x the dice', rentFor(game.state, 12, 9) === 90);
  check('the Chance card forces a 10x utility rate', rentFor(game.state, 12, 9, 1, 10) === 90);
}

// --- building --------------------------------------------------------------
{
  const { game, a, own } = table();
  own(1, a.id);
  check('a partial set cannot be built on', !canBuild(game.state, a.id, 1).ok);

  own(3, a.id);
  check('a full set can be built on', canBuild(game.state, a.id, 1).ok);

  check('first house is bought', game.build(a.id, 1) === null);
  check('even build blocks a second house on the same street',
    !canBuild(game.state, a.id, 1).ok, canBuild(game.state, a.id, 1).reason);
  check('the sibling street can be built instead', canBuild(game.state, a.id, 3).ok);

  game.build(a.id, 3);
  const before = game.state.housesLeft;
  check('bank house stock drops as houses are built', before === 30, `${before} left`);

  // Take both streets to a hotel and confirm the bank's stock is returned.
  for (let i = 0; i < 3; i++) { game.build(a.id, 1); game.build(a.id, 3); }
  check('both streets reach four houses',
    game.state.properties[1]!.houses === 4 && game.state.properties[3]!.houses === 4);
  game.build(a.id, 1);
  check('a hotel replaces four houses', game.state.properties[1]!.houses === 5);
  // Eight houses were placed (32-8=24); the hotel hands its four back.
  check('the four houses go back to the bank', game.state.housesLeft === 28, `${game.state.housesLeft} left`);
  check('a hotel is taken from the bank', game.state.hotelsLeft === 11);

  check('a built street cannot be mortgaged', !canMortgage(game.state, a.id, 3).ok);
  game.sellHouse(a.id, 1);
  check('selling a hotel returns four houses', game.state.properties[1]!.houses === 4);
  check('hotel returns to the bank', game.state.hotelsLeft === 12);
}

// --- mortgages -------------------------------------------------------------
{
  const { game, a, own } = table();
  own(1, a.id); own(3, a.id);
  const cash = game.player(a.id)!.cash;
  game.mortgage(a.id, 1);
  check('mortgaging pays half the price', game.player(a.id)!.cash === cash + 30);
  check('a mortgaged member blocks building on the set', !canBuild(game.state, a.id, 3).ok);
  game.unmortgage(a.id, 1);
  check('lifting a mortgage costs 10% interest', game.player(a.id)!.cash === cash - 3, `${game.player(a.id)!.cash} vs ${cash - 3}`);
  check('the set can be built on again', canBuild(game.state, a.id, 3).ok);
}

// --- trades ----------------------------------------------------------------
{
  const { game, a, b, own } = table();
  own(1, a.id); own(3, a.id); own(6, b.id);
  game.build(a.id, 1);

  check('a street with buildings cannot be traded',
    game.offerTrade(a.id, b.id, { cash: 0, properties: [1], jailCards: 0 }, { cash: 0, properties: [], jailCards: 0 }) !== null);
  check('cash beyond your balance cannot be offered',
    game.offerTrade(a.id, b.id, { cash: 999_999, properties: [], jailCards: 0 }, { cash: 0, properties: [], jailCards: 0 }) !== null);
  check('you cannot ask for what someone does not own',
    game.offerTrade(a.id, b.id, { cash: 0, properties: [], jailCards: 0 }, { cash: 0, properties: [9], jailCards: 0 }) !== null);

  const err = game.offerTrade(a.id, b.id, { cash: 100, properties: [3], jailCards: 0 }, { cash: 0, properties: [6], jailCards: 0 });
  check('a valid offer is accepted by the server', err === null, err ?? '');
  const offer = game.state.trades.at(-1)!;
  const cashA = game.player(a.id)!.cash;
  game.respondTrade(b.id, offer.id, true);
  check('accepting moves the properties', game.state.properties[3]!.owner === b.id && game.state.properties[6]!.owner === a.id);
  check('accepting moves the cash', game.player(a.id)!.cash === cashA - 100);
}

// --- jail and bankruptcy ---------------------------------------------------
{
  const { game, a, b, own } = table();
  const pa = game.player(a.id)!;
  pa.inJail = true;
  pa.cash = 40;
  check('you cannot buy your way out without the fine', game.payJail(a.id) !== null);
  pa.cash = 100;
  game.state.turn.playerId = a.id;
  game.state.turn.phase = 'pre-roll';
  game.state.turn.rolled = false;
  check('paying the fine leaves jail', game.payJail(a.id) === null && !pa.inJail);
  check('the fine is deducted', pa.cash === 50);

  own(1, b.id);
  const worth = netWorth(game.state, b.id);
  check('net worth counts property at list price', worth === game.player(b.id)!.cash + 60, `${worth}`);
}

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(', ')}` : '\nall rule checks passed');
process.exit(failures.length ? 1 : 0);
