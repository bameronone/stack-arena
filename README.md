# Stack Arena

An auto-battler for 2 to 8 gladiators, inspired by Dota 2's *Auto Gladiators* custom game. Pick a gladiator, buy buff cards between rounds, and watch the fight resolve on its own.

## Play

Open `dist/index.html` in a browser. It's one self-contained file with no server and no install. It loads fonts from Google Fonts and falls back to system fonts offline.

- **Against bots:** set up a lobby of 1 to 7 AI rivals, each at its own level: **Squire** (easy), **Gladiator** (normal) or **Champion** (hard). One rival is a 1v1 duel; more is a free-for-all where the last gladiator standing wins.
- **Online:** one player hosts a room and shares its 5-letter code or invite link; up to 7 others join, and empty slots can be filled with bots. Online play needs the GitHub Pages version (or any normal web host); it doesn't work inside the Claude artifact preview.
- **Timers:** bans (20s), picks (30s), signatures (20s) and the shop (20/30/45s, or off when playing solo). When time runs out you get a random ban, gladiator or signature, and the fight starts.

### How online play works

There is no game server. The host's browser runs the match (the same code that runs solo games) and the other browsers send it their actions: ban, pick, buy, reroll, ready. After each change the host sends everyone the match state. Fights are deterministic from a shared seed, so each player's browser replays their own fight locally and gets exactly the result the host computed.

Browsers find each other through [PeerJS](https://peerjs.com)'s free public server, then talk directly over WebRTC. The host's tab must stay open for the whole match. If a player leaves, a bot takes over their gladiator. Some strict networks (some workplaces and mobile carriers) block direct connections; on those, joining fails with a timeout.

For local testing, add `?net=local` to the URL: tabs of the same browser then talk over a BroadcastChannel instead of the internet.

## Host it free on GitHub Pages

1. Push this folder to a GitHub repository. The branch should be `main`.
2. In the repo, go to **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` then runs `.github/workflows/pages.yml`, which tests, builds and publishes the game to `https://<user>.github.io/<repo>/`.

Pages is free for public repositories. On a free account, a private repo can't use Pages.

## Develop

Requires Node 18+. There are no dependencies.

| Command | What it does |
|---|---|
| `npm run build` | Bundles `src/` into `dist/index.html` (standalone page) and `dist/artifact.html` (body-only, for a Claude artifact) |
| `npm test` | Engine and AI unit tests (`node:test`) |
| `npm run sim -- 2000` | Plays 2000 bot-vs-bot matches and prints win rates by character, resource and card |
| `node tools/duel.mjs 400 hard normal` | Plays two AI levels against each other to check that the harder one is stronger |
| `node tools/ffa.mjs 200 8 easy,normal,hard` | Plays free-for-all bot matches; reports match length and average placement by gladiator and level |
| `node tools/cardvalue.mjs` | Measures each card's value by simulation and regenerates `src/ai/cardValues.js` (run this after balance changes) |
| `node tools/autotune.mjs 3` | Nudges each gladiator's base HP toward a 50% win rate (edits `characters.js`; review the diff) |
| `node tools/pixellab-mcp.mjs create\|animate\|fetch <gladiator>` | Makes a gladiator's sprites with [PixelLab](https://www.pixellab.ai) through its MCP server, which spends subscription generations (about 7 per gladiator): `create` the character, `animate` idle/attack/cast/hurt/death, then `fetch` the frames into `assets/sprites/<gladiator>/` once they finish. Key from `PIXELLAB_API_KEY` or a git-ignored `.pixellab-key`; behind a proxy add `NODE_USE_ENV_PROXY=1` |
| `NODE_PATH=$(npm root -g) node tools/playtest.cjs <outdir> [w] [h] [players]` | Plays a full solo match in headless Chromium, saves screenshots, reports JS errors and sideways scrolling |
| `NODE_PATH=$(npm root -g) node tools/mptest.cjs <outdir> [leave]` | Plays an online match between two headless browser pages plus a bot (local transport); `leave` makes the guest quit mid-match |

## Layout

```
src/
  rng.js                seeded PRNG; every roll in a match goes through it
  data/tags.js          the 13 tags, tier thresholds, card costs
  data/cards.js         129 cards as data + hook functions
  data/characters.js    12 gladiators, abilities, signatures, ban visibility rule
  engine/combat.js      deterministic fight simulation (20 ticks/s)
  engine/shop.js        shop pool, tier unlocks, weighting
  engine/match.js       match state (plain JSON), rounds, ban votes, pairings, ghosts, placements
  ai/bot.js             the rival: three difficulty levels
  ai/cardValues.js      generated: measured value of each card
  game/host.js          authoritative game loop: phases, timers, bots, fights (solo games use it too)
  game/session.js       what the UI talks to: solo game, hosted room or joined room
  net/transport.js      PeerJS (WebRTC) and same-browser transports
  ui/arena.js           canvas renderer for fights (sprites when present, medallions otherwise)
  ui/app.js             screens and shop UI
  ui/style.css
assets/sprites/         gladiator sprites from PixelLab (tools/pixellab-mcp.mjs); Cinder so far
tools/                  build, balance sim, browser playtest, sprite generator
tests/                  unit tests
```

The engine has no DOM dependencies. The same code runs in the browser, the simulator and the tests.

## Adding content

- **A card:** add an entry to `CARDS` in `src/data/cards.js`. Give it `tags`, `tier` (1-4, `'hybrid'` or `'counter'`), `max` copies, a `desc(n)` and one or more hooks (`onAttack`, `onCrit`, `onEvade`, `onPain`, `onCast`, `onFreeze`, `onHitTaken`, `every`, `bonusDamage`, `setup`). Then run `node tools/cardvalue.mjs` so the AI knows its value, and `npm run sim` to see how it performs.
- **A gladiator:** add an entry to `CHARACTERS` with a `trigger`, 1-2 `resources`, `stats`, an `innate`, an `ability.cast` and two `signatures`.
- **More players:** matches support 2 to 8 players (`MAX_PLAYERS`), any mix of humans and bots.

See `DESIGN.md` for the rules and balance notes.
