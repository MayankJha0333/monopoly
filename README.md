# Rent Rush

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

### Going live on a VM (Google Cloud, or any Ubuntu/Debian server)

`docker-compose.prod.yml` runs the game with [Caddy](https://caddyserver.com)
in front of it. Caddy gets and renews the HTTPS certificate by itself and
passes live sockets through.

1. Point the domain's `A` record at the VM's static IP (no `AAAA` record).
2. Open ports 80 and 443 (on Google Cloud: tick *Allow HTTP* and *Allow HTTPS*).
3. On the VM:

   ```bash
   git clone https://github.com/MayankJha0333/monopoly.git rentrush
   cd rentrush
   bash deploy/setup.sh          # swap, Docker, build, start; DOMAIN=rentrush.in by default
   ```

   For another domain: `DOMAIN=play.example.com bash deploy/setup.sh`
   (it is saved to `.env`).

### Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` runs on every push and pull request:

1. **Rules, accounts and sockets** — typecheck, build, rules, auth, a 60-game
   simulation and the socket end-to-end test.
2. **Browser tests** — the Playwright suite, using the runner's Chrome.
3. **Deploy** (pushes to `main` only, after both pass) — connects to the VM
   over SSH, runs `deploy/update.sh <commit>`, then checks
   `https://rentrush.in/healthz`. The old version keeps serving until the new
   one has built; if the build fails, the site stays on the old version.

One-time setup, in the repository's *Settings → Secrets and variables →
Actions*:

| Secret | Value |
| --- | --- |
| `VM_HOST` | The VM's external IP |
| `VM_USER` | The Linux user on the VM (`whoami` in the VM's SSH window) |
| `VM_SSH_KEY` | Private key of a deploy key whose public half is on the VM |

Optional variable `APP_URL` if the site is not `https://rentrush.in`.

**Roll back:** open an older successful run in the Actions tab and choose
*Re-run jobs* — it deploys that run's commit. Or on the VM:
`bash deploy/update.sh <commit>`.

**Deploy by hand:** `bash deploy/update.sh` on the VM moves it to the latest
`main`. Matches in progress end on a restart.

Useful commands on the VM (from the project folder):

| Command | What it does |
| --- | --- |
| `sudo docker compose -f docker-compose.prod.yml ps` | Is everything running? |
| `sudo docker compose -f docker-compose.prod.yml logs -f app` | Live game server log |
| `sudo docker compose -f docker-compose.prod.yml logs caddy --tail 50` | HTTPS / certificate log |
| `sudo docker compose -f docker-compose.prod.yml restart app` | Restart the game |

Accounts live in the `app-data` Docker volume on the VM's disk, so a disk
snapshot schedule backs them up.

### Configuration

Copy `.env.example` for the full list. The ones that matter in production:

| Variable | What it does |
| --- | --- |
| `PORT` | Port to listen on (default 3001). |
| `DATA_DIR` / `DB_FILE` | Where the SQLite database is kept. Put it on a persistent disk. |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to open a socket. |
| `TRUST_PROXY` | Set behind a load balancer so rate limits see real client IPs. |
| `COOKIE_SECURE` | Session cookies are HTTPS-only in production; `0` turns that off for local testing. |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Voice and video at private tables. Leave unset to hide the feature. |

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

**Play with friends** opens a private table page in the same sunny style as
the menu: a big table code with Copy / Share buttons, a seat card for every
place at the table (open seats wait for friends), your character and colour,
and the house rules (auctions, Beach Break pot, match length, turn timer,
starting cash, table size). The host can fill empty seats and starts the game.

During a match, the Log / Chat / Trades panel starts minimized as a small
dock (right side on desktop, above the action bar on phones), so the board
gets the room. The dock shows counts for new log lines, chat messages and
offers, and opens by itself when someone sends you a trade. Opening it is
remembered for next time.

When several players share a tile, their pieces line up in two columns running
into the tile (a grid on corners) and shrink a little as it fills, so nobody
spills onto a neighbouring tile. A piece walking past a crowd slides into the
next free spot. The layout lives in `tokenPlace` in `client/src/lib/layout.ts`
and is checked by `tests/crowd.spec.ts`.

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

### Chat, typing and voice

Every table has a text chat. While someone is writing, the others see
"Ana is typing…" above the box, and the chat button in the dock gets a small
dot; the line fades three seconds after the last keystroke. The ping carries
no text and is never echoed back to the sender.

Tables made with friends also get **voice chat**, through
[LiveKit](https://livekit.io). Everyone is put into the call as they take a
seat, so a conversation can simply start — no button to find first. The bar
shows who is in the call, a green ring around whoever is talking, and a meter
for your own microphone so you can see it is working. Mute yourself from the
bar, or from the microphone button in the game's top bar, and hang up at any
time (a **Rejoin call** button then takes you back). The **host can silence
anyone** at the table from their tile; that player can turn their microphone
back on, and the host can silence it again.

The server hands out a short-lived pass for that table's call only and never
carries the sound itself. Quick Play seats strangers together, so it stays
text-only, and with no LiveKit keys set the bar says so instead of appearing
broken. There is no video: voice only.

### Notifications

With notifications switched on in **Settings**, a player whose game is in
another tab is told when it is their turn, when someone chats, when a trade
offer arrives, when a friend takes a seat, and when the match starts. Nothing
is shown while the tab is in front, at most one notification every two seconds,
and clicking one brings the game back. The browser is only asked for
permission from that switch, because browsers refuse the ask otherwise.

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
