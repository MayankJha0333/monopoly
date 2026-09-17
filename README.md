# Sunnyport

A real-time multiplayer property-trading board game on a sunny 3D island.
Press **Play** and you are at a four-player table within seconds; or make a
private table and invite friends with a code.

Everything you see is generated in code — the board face, the island and its
town, the pawns, dice, characters and sounds. There are no binary art or audio
assets in the repo. See `ASSETS.md`.

## Running it

Needs **Node 22.13 or newer** (the server uses Node's built-in SQLite).

```bash
npm install
npm run dev          # game server on :3001, client on :5173
```

Open http://localhost:5173 and press **Play**.

Production build:

```bash
npm run build        # typecheck + bundle into dist/
npm start            # serves dist/, the API and the socket server on :3001
```

Or with Docker:

```bash
docker compose up --build        # http://localhost:3001, data kept in a volume
```

### Configuration

Copy `.env.example` for the full list. The ones that matter in production:

| Variable | What it does |
| --- | --- |
| `PORT` | Port to listen on (default 3001). |
| `DATA_DIR` / `DB_FILE` | Where the SQLite database is kept. Put it on a persistent disk. |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to open a socket. |
| `TRUST_PROXY` | Set behind a load balancer so rate limits see real client IPs. |
| `COOKIE_SECURE` | Session cookies are HTTPS-only in production; `0` turns that off for local testing. |

Deploy behind HTTPS (Render, Fly.io, Railway, a VPS with Caddy/Nginx). One
instance holds all live tables in memory, so run a single instance, or add
sticky sessions and a shared room store before scaling out.

## How a player gets in

1. **Home.** The island turns slowly behind the menu. Pick a nickname,
   character and colour.
2. **Play.** A guest account is created on the spot (no form), so XP and coins
   are kept from the first match.
3. **Matchmaking.** You are seated at the next table that is filling up. If no
   one else arrives within a few seconds, the empty seats are filled so the
   match always starts quickly. Filled seats look and play like everyone else.
4. **Match.** Four players, 45-second turns, 15 rounds. When the final round
   ends, the richest player wins. Big moments — a purchase, a new house, a
   deal, someone sent to Lockup, a bankruptcy — pop up as a banner for
   everyone at the table, once the dice and pawn have stopped moving.
5. **Results.** Podium, XP and coins earned, level bar, and **Play again**.

**Sign up** (username, email, password) at any time. A guest who signs up
keeps everything they earned. Members appear on the leaderboard.

**Play with friends** creates a private table with house rules (auctions,
Beach Break pot, match length, turn timer, starting cash, table size). Share
the five-character code or the invite link; the host can fill empty seats.

## How it fits together

| Path | What lives there |
| --- | --- |
| `shared/` | Board data, cards, types, rule helpers and the level curve — used by both sides. |
| `server/engine.ts` | The authoritative game: rules, turn phases, money, round limit and final standings. |
| `server/rooms.ts` | Tables, Quick Play seating, seat fillers, reconnects, rewards. |
| `server/bot.ts` | Decisions for filled seats and for players who left mid-match. |
| `server/auth.ts` | Accounts, password hashing, sessions, profile and leaderboard API. |
| `server/db.ts` | SQLite schema (users, sessions). |
| `server/index.ts` | HTTP + Socket.IO wiring, security headers, static hosting, shutdown. |
| `client/src/ui/Home.tsx` | Menu: character picker, Play, friends, leaderboard, settings. |
| `client/src/ui/Matchmaking.tsx`, `Results.tsx` | Waiting room and end-of-match screens. |
| `client/src/board3d/` | The 3D board: island scenery, town, pawns, houses, flags, dice and camera. |
| `client/src/board/` | The 2D board, used on devices without WebGL or when chosen in Settings. |
| `client/src/lib/boardTexture.ts` | Paints the board face; `cityPlan.ts` lays out the town for both views. |

The server is authoritative: clients send intents (`game:roll`,
`trade:offer`) and receive the whole state back. Seat fillers are marked only
on the server; the state sent to clients never says which seats they are.

### Music

`client/src/audio/music.ts` plays "Island Breeze", a relaxed tune made live
with the Web Audio API: pad, bass, off-beat ukulele, soft percussion and a
steel-drum melody that is re-invented every loop so it never feels stuck.
It starts on the first tap (browsers require that), plays in the menus and
at the table, pauses when the tab is hidden, and has an on/off switch and a
volume slider in Settings.

### Pace

The table is tuned to feel relaxed: pawns walk about four tiles a second,
the dice hang for a moment after landing, filled seats wait for the throw
and walk to finish and then take one to three seconds to decide, cards stay
up long enough to read, and a finished turn passes on after nine seconds.
Timings live at the top of `server/rooms.ts`, `client/src/board3d/Board3D.tsx`,
`Dice3D.tsx` and `client/src/ui/ActionBar.tsx`.

### Accounts and security

- Passwords: scrypt with a per-user salt; constant-time comparison.
- Sessions: random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie
  (`Secure` in production). Only a SHA-256 of the token is stored.
- Sign-in and sign-up are rate limited per IP; write requests must be JSON
  from the same origin.
- Socket events are rate limited per connection and every payload is
  validated before it reaches the engine.
- Production responses carry CSP, HSTS, `nosniff`, frame and referrer headers.

### The 3D board

`client/src/board3d/Board3D.tsx` uses three.js through React Three Fiber.
On a throw the camera flies to the player rolling, the dice tumble onto the
promenade and land on the values the server picked, the pawn hops tile by
tile, and the view pulls back out. Buying plants a flag in the owner's colour
on the rim; houses and hotels rise on the colour band. Click any tile to
read its deed. **Settings** switches between 3D and 2D and between high and
low graphics; weaker devices start on low, and devices without WebGL get 2D.

## Tests

```bash
npm test             # everything: rules, accounts, simulation, sockets, browser

npm run test:rules   # rent, building, mortgages, trades
npm run test:auth    # password hashing, guest upgrade, sessions, round cap
npm run sim 150      # filler-only games, checking engine invariants every step
npm run e2e          # real sockets: private tables, Quick Play, accounts, reconnect
npm run test:ui      # Playwright: menus, matchmaking, sign-up, turns, trading, phone layout
npm run smoke        # Playwright: writes screenshots of every screen to shots/
```

Browser tests use your installed Chrome. Set `PW_CHROMIUM=/path/to/chromium`
to use another Chromium build.

## Known limits

- Live tables are kept in memory; a restart ends games in progress (accounts
  and stats are safe in SQLite).
- Filler-only games occasionally run long without a round limit; Quick Play
  always has one.
- Bankrupting to the bank returns property unowned rather than auctioning it.
- Email is collected but not yet verified, and there is no password reset
  flow. Add an email provider before relying on email for recovery.
