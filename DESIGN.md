# Design notes

## Core loop

1. **Ban:** each player secretly bans one resource. Banned resources leave the card pool, along with every hybrid and counter card that uses them.
2. **Pick:** gladiators whose resources are *all* banned are hidden. Two-resource gladiators with one banned stay pickable, with a warning.
3. **Rounds:**
   - Gold arrives: `min(10, 4 + round)` plus interest of 1 per 10 banked (max 2).
   - The shop shows 5 cards. Reroll costs 1 gold and you can lock the shop. There is no selling: every purchase is permanent.
   - Then the auto fight.
   - The loser takes `1 + ceil(0.8 × round) + 4 × winner's HP%` damage. Each player starts with 60 HP.
4. **Round 7:** each player picks one of two signature upgrades for their gladiator.

## Triggers and resources

- **Triggers** (Strike, Precision, Evasion, Wounded, Spell) decide when stacks are gained. Owning cards with a trigger tag makes that trigger happen more often:
  - Strike: +1% attack speed per card
  - Precision: +1% crit per card
  - Evasion: +3% Focus per hit taken per card
  - Wounded (internally `pain`): you become Wounded every 12% of max HP lost, 0.5% sooner per card (min 4%). It used to be a flat 5-6% for everyone, which made these cards good in every build.
  - Spell: +0.5 mana per attack per card
- **Resources** (Fire, Frost, Poison, Bleed, Shield, Regen, Mana, Armor) decide what stacks do.
- **Generator cards** pair a trigger with a resource and always fire. There's one for every one of the 40 trigger-resource pairs. Cards with only a resource tag that make stacks fire 30% of the time, or run on a slow timer.

## Tiers

- Owning 4, 9 or 15 cards that share a tag unlocks that tag's Uncommon, Rare or Mythic cards.
- A Hybrid needs 5 cards in each of its two resources.
- Shop weight grows with the number of cards you own of a card's tags (up to 3x) and is 1.5x for your gladiator's tags.
- There is no selling. Every purchase is permanent.

## Evasion (Focus)

- Dodge chance starts at 0.
- Each hit you take adds your Focus gain (10% innate on Wisp Dancer, 4.5% on Nightshade, +3% per Evasion card, +3% per Light Feet). A dodge resets Focus to 0.
- Focus is checked *before* it grows, so you can never dodge twice in a row. At +10% per hit, that comes to about 21.5% of attacks dodged.
- Focus is capped at 60%.
- Counterplay:
  - Dodged attacks still fire the attacker's on-attack (Strike) effects.
  - Poison, Bleed and abilities can't be dodged.
  - True Sight makes every 4th attack undodgeable.
  - Unsettling Blows drains 10% of the target's Focus per copy.
  - Wisp Dancer sheds 4 Poison and 4 Bleed on each dodge, so evasion still has an answer to damage over time.

## Fights

- The simulation runs at 20 ticks per second and is seeded, so replays are deterministic.
- Frost freezes at 16 stacks. Armor blocks 1.25 damage per stack from each attack.
- After 30s, all damage ramps up by 8% per second.
- Hard cap at 90s; if it's reached, higher HP% wins.

## The rival AI

| Level | Name | How it plays |
|---|---|---|
| easy | Squire | Commits loosely to its gladiator's tags and buys with a lot of randomness. Rerolls once. |
| normal | Gladiator | Scores cards using their **measured** value (`src/ai/cardValues.js`) plus a light pull toward its two-resource plan. Protects interest early, rerolls up to 4 times, spends leftover gold, buys counters when your main resource gets big, and goes for hybrids. |
| hard | Champion | Same as Gladiator, but test-fights its top 3 candidate cards against your current build (4 seeded fights each) before buying, and picks its signature the same way. A shop turn takes about 5 ms. |

The AI only sees what a player would see: your gladiator and your cards.

Measured ladder over 400 matches with alternating seats:
- Gladiator beats Squire 91% of the time.
- Champion beats Gladiator 61%.
- Champion beats Squire 95%.

Hand-written card scoring did no better than random buying. Measuring each card's value by simulation (`tools/cardvalue.mjs`) is what made the Gladiator level work, and it also surfaced most of the balance problems fixed in this pass.

## Balance status

These are 3000-match results between Gladiator-level bots:

- **Characters:** every gladiator wins 45–58%.
- **Resources:** each lands between 47% and 55%.
- **Average match:** about 11 rounds, with fights of about 12s.

After changing cards, re-run `tools/cardvalue.mjs` (so the AI's card values stay accurate), then `npm run sim`.

## Ideas not built yet

- Shared card pool with limited copies, so players compete for a resource once there are 3+ players.
- Item and artifact slots (Auto Gladiators' equipment layer).
- Multiplayer: the match state is plain JSON and the fight is deterministic from the seed, so a server only needs to relay shop actions.
