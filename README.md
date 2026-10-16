# Stack Arena

A 1v1 auto-battler inspired by Dota 2's *Auto Gladiators* custom game. Pick a gladiator, buy buff cards between rounds, and watch the fight resolve on its own.

## Play

Open `dist/index.html` in a browser. It's one self-contained file with no server and no install. It loads fonts from Google Fonts and falls back to system fonts offline.

You play against an AI rival at one of three levels: **Squire** (easy), **Gladiator** (normal) or **Champion** (hard).

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
| `node tools/cardvalue.mjs` | Measures each card's value by simulation and regenerates `src/ai/cardValues.js` (run this after balance changes) |
| `node tools/autotune.mjs 3` | Nudges each gladiator's base HP toward a 50% win rate (edits `characters.js`; review the diff) |
| `NODE_PATH=$(npm root -g) node tools/playtest.cjs <outdir> [w] [h]` | Plays a full match in headless Chromium, saves screenshots, reports JS errors and sideways scrolling |

## Layout

```
src/
  rng.js                seeded PRNG; every roll in a match goes through it
  data/tags.js          the 13 tags, tier thresholds, card costs
  data/cards.js         129 cards as data + hook functions
  data/characters.js    12 gladiators, abilities, signatures, ban visibility rule
  engine/combat.js      deterministic fight simulation (20 ticks/s)
  engine/shop.js        shop pool, tier unlocks, weighting
  engine/match.js       match state (plain JSON), rounds, bans, damage, pairings
  ai/bot.js             the rival: three difficulty levels
  ai/cardValues.js      generated: measured value of each card
  ui/arena.js           canvas renderer for fights
  ui/app.js             screens and shop UI
  ui/style.css
tools/                  build, balance sim, browser playtest
tests/                  unit tests
```

The engine has no DOM dependencies. The same code runs in the browser, the simulator and the tests.

## Adding content

- **A card:** add an entry to `CARDS` in `src/data/cards.js`. Give it `tags`, `tier` (1-4, `'hybrid'` or `'counter'`), `max` copies, a `desc(n)` and one or more hooks (`onAttack`, `onCrit`, `onEvade`, `onPain`, `onCast`, `onFreeze`, `onHitTaken`, `every`, `bonusDamage`, `setup`). Then run `node tools/cardvalue.mjs` so the AI knows its value, and `npm run sim` to see how it performs.
- **A gladiator:** add an entry to `CHARACTERS` with a `trigger`, 1-2 `resources`, `stats`, an `innate`, an `ability.cast` and two `signatures`.
- **More players:** match state already holds a `players` array, and `pairings()` handles any count, including a ghost opponent for odd numbers. What's still missing is UI for more than one rival, plus networking.

See `DESIGN.md` for the rules and balance notes.
