# 🏝️ Hide Island

A real-time multiplayer treasure-hunt battle. **5–10 players** spawn at random
spots in the open ocean. Hidden somewhere on **5–6 islands** is treasure (on
just **1–2** of them). Everyone bets game tokens into a pot, then races to find
and grab the treasure first. **First to the treasure wins the entire pot** and
banks the **gems** inside it — spend gems on **weapons** and **costumes**.

```
Ocean  ──►  Islands (5–6)  ──►  Treasure on 1–2 islands  ──►  First grab wins pot + gems
```

## Features

- **Real 3D world (three.js)** — animated ocean with rolling waves, 3D islands
  (sand, grassy domes, palm trees), 3D player avatars with floating name labels,
  glowing treasure chests, dynamic sun + soft shadows, fog, and a smooth
  follow-camera. The 2D server simulation is mapped onto the 3D ground plane
  (`server.x → X`, `server.y → Z`) so no server changes were needed.
- **Authoritative multiplayer server** (Node + Socket.IO) — the server runs the
  simulation; clients render and send input. No client-side cheating of positions.
- **Procedural map** each match: 5–6 non-overlapping islands, ocean spawns,
  treasure hidden on a random 1–2 islands (positions are *not* sent to clients —
  you have to explore to find them).
- **Controls:** WASD / arrow keys on desktop **and** an on-screen joystick on
  touch devices.
- **Betting & pot:** ready-up to wager `DEFAULT_BET` tokens; winner takes the
  whole pot. No winner before the timer → everyone is refunded.
- **Gems economy + shop:** treasures contain a visible amount of gems; spend them
  on weapons and costumes that persist with your wallet identity.
- **Wallet layer (swappable):** runs on a **mock wallet** out of the box (zero
  setup), and is wired for **Privy embedded wallets (login with X) + Solana**
  (SOL / your pump.fun / bags.app token) when you add credentials.

## Quick start

```bash
npm install
npm start
# open http://localhost:3000 in 2+ browser tabs/devices to play multiplayer
```

`npm run dev` runs with `--watch` for auto-reload during development.

## Deployment ⚠️ (read this)

Hide Island is a **persistent real-time Node server**: it keeps game rooms in
memory, runs physics loops on a timer, and holds long-lived **WebSocket
(Socket.IO)** connections.

**It cannot run on plain Vercel / Netlify / GitHub Pages** — those are
static/serverless hosts. They don't run a long-lived Node process, so
`/socket.io/...` returns 404, the client can't connect, and the buttons appear
dead. **Deploy to a host that runs a real Node server instead:**

| Host | How |
| --- | --- |
| **Render** (free, easiest) | New + → **Blueprint** → pick this repo (uses `render.yaml`). Or: New Web Service → Build `npm install`, Start `npm start`, Health check `/health`. |
| **Railway** | New Project → **Deploy from GitHub repo** → pick this repo. It builds the `Dockerfile` and reads `railway.json`. Then **Settings → Networking → Generate Domain** to get a public URL. |
| **Fly.io** | `fly launch` (uses the included `Dockerfile`). |
| **Any container host** | Build the `Dockerfile` and run it; it listens on `$PORT`. |

All of these read `PORT` from the environment automatically. No build step is
required beyond `npm install`.

## How to play

1. Enter a name (or "Connect with X" once Privy is configured) → you join a lobby.
2. Press **Ready & Bet** to wager into the pot. When enough players are ready,
   a countdown starts.
3. Swim around the ocean, land on islands, and **find the hidden treasure first**.
4. Winner takes the pot + gems. Spend gems in the 🛒 **Shop**.

Tune match rules (player counts, bet size, world/island sizes, timers) in
[`server/game/constants.js`](server/game/constants.js).

## Project structure

```
server/
  index.js               Express + Socket.IO wiring, matchmaking, event routing
  game/
    constants.js         Tunable game/world/economy constants
    Map.js               Island + treasure + spawn generation
    Player.js            Per-player match state
    Room.js              Match state machine + authoritative simulation loop
  economy/
    economy.js           Virtual token + gems ledger (swappable for on-chain)
    shop.js              Weapons & costumes catalog + purchase logic
  wallet/
    walletService.js     Picks mock vs. real wallet from env
    mockWallet.js        Zero-credential stand-in (default)
    privySolanaWallet.js Privy + Solana integration scaffold
public/
  index.html, css/       UI shell and styles
  js/
    main.js              Client orchestration + game loop
    net.js               Socket.IO wrapper
    input.js             WASD + touch joystick
    render3d.js          three.js 3D scene (ocean, islands, avatars, chests, camera)
    render.js            Shared costume colors + 2D minimap overlay
    ui.js                Screens, lobby, shop, wallet modals
```

## Going on-chain (Privy + Solana)

The game is fully playable today with the mock wallet. To use real wallets and
your token:

1. Install the optional deps:
   ```bash
   npm i @privy-io/server-auth @solana/web3.js @solana/spl-token
   ```
2. Copy `.env.example` → `.env` and set `WALLET_MODE=privy`, `PRIVY_APP_ID`,
   `PRIVY_APP_SECRET`, `SOLANA_RPC_URL`, and `GAME_TOKEN_MINT` (your pump.fun /
   bags.app mint).
3. Add the Privy browser SDK to the client login flow and pass the resulting
   access token to the server's `login` event (see `btn-login-x` in
   `public/js/main.js` and `verifyLogin` in `server/wallet/privySolanaWallet.js`).

The server only depends on the wallet *interface*, so gameplay and the gems
economy work identically on mock or real wallets.

> **Note:** the on-chain pieces (token deposits, buying the pump.fun/bags token,
> escrowing real bets) are scaffolded with documented integration points but are
> **not** wired to live funds in this build — they need your credentials and a
> security review before handling real money.
