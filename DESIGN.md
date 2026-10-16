# Design notes

## Core loop

0. **Lobby:** 2 to 8 players (you plus 1 to 7 bots). Two players is a duel; more is a free-for-all. The last gladiator standing wins; everyone else gets a placement in the order they're knocked out.
1. **Ban:** each player secretly votes to ban one resource. The two most-voted resources are banned, with ties broken at random (in a duel that's simply both picks). Banned resources leave the card pool, along with every hybrid and counter card that uses them.
2. **Pick:** gladiators whose resources are *all* banned are hidden. Two-resource gladiators with one banned stay pickable, with a warning.
3. **Timers** (online always, solo optional): ban 20s, pick 30s, signature 20s, shop 20/30/45s. Running out picks at random or starts the fight. In multiplayer the fight starts early once every living player has pressed Ready.
4. **Rounds:**
   - Gold arrives: `min(10, 4 + round)` plus interest of 1 per 5 banked (max 3, at 15 gold). It was 1 per 10 (max 2), which made saving feel pointless.
   - The shop shows 5 cards. Reroll costs 1 gold and you can lock the shop. There is no selling: every purchase is permanent.
   - Then the auto fights. Pairings are random each round, avoiding last round's opponent where possible. With an odd number alive, one player fights a **ghost**: a copy of another living player's build. Losing to a ghost costs HP; beating one doesn't hurt the player it copies.
   - In the browser, your fight is animated and the others resolve instantly. In a free-for-all you can watch any other fight of the round from the results banner (it replays from the shared seed). Once you're knocked out, the bots finish the match instantly and you see the final standings.
   - The loser takes `1 + ceil(0.8 × round) + 4 × winner's HP%` damage. Each player starts with 60 HP.
   - Gladiators' fight HP grows each round: max HP × `1 + 0.015 × (round − 1)²` (1.24x in round 5, 2.5x in round 11, 3.5x in round 14). Without it, late fights ended in about 4s, often in one cast. Effects worth a percent of max HP (bleed, regen, Juggernaut, shields...) use the HP before scaling, so they don't outgrow everything else.
   - The shop shows next round's gold: income plus interest, and how much more to keep for the next interest step.
5. **Round 7:** each player picks one of two signature upgrades for their gladiator.

## Triggers and resources

- **Triggers** (Strike, Precision, Evasion, Health, Spell) decide when stacks are gained. Owning cards with a trigger tag makes that trigger happen more often:
  - Strike: +1% attack speed per card
  - Precision: +1% crit per card
  - Evasion: +3% Focus per hit taken per card
  - Health (internally `pain`, formerly Wounded): +5 max HP per card, and "When hurt" fires every 12% of max HP lost, 0.5% sooner per card (min 4%). The max-HP cards (Hearty, Juggernaut, Titan) are Health cards.
  - Spell: +0.5 mana per attack per card
- **Resources** (Fire, Frost, Toxin, Bleed, Shield, Regen, Mana, Armor) decide what stacks do.
  - Toxin (internally `poison`, formerly Poison) goes through Armor but Shield blocks it.
  - Regen heals 0.2% of base max HP per second per stack. Every 5% of base max HP healed, from any source, fires "On heal" (Sap Ward, Bloom Burst, Evergreen).
  - Gaining Fire melts the same number of Frost stacks on you.
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
  - Toxin, Bleed and abilities can't be dodged.
  - True Sight makes every 4th attack undodgeable.
  - Unsettling Blows drains 10% of the target's Focus per copy.
  - Wisp Dancer sheds 4 Toxin and 4 Bleed on each dodge, so evasion still has an answer to damage over time.

## Fights

- The simulation runs at 20 ticks per second and is seeded, so replays are deterministic.
- Frost freezes at 16 stacks. Armor blocks 1.25 damage per stack from each attack.
- **Overtime** (like TFT), so every fight ends in a death:
  - from 30s: all damage +8% per second, and healing and shield gains -3% per second (gone entirely at about 63s);
  - from 60s: the arena burns both fighters for unblockable damage that grows every second (0.5% of max HP per second, per second past 60).
  - Even a mirror of two maximum-defense builds ends around 50s. In bot play about 4% of fights pass 30s and under 1% pass 60s.

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

These are 1500-match results between Gladiator-level bots:

- **Characters:** every gladiator wins 47–54% (base HP tuned with `tools/autotune.mjs`, which is why base HP now ranges from 260 to 1065).
- **Resources:** 48–53%. Toxin decays 2% of its stacks per second so it levels off instead of snowballing.
- **Average match:** about 11 rounds, with fights of about 15s that stay that long into the late game.

After changing cards, re-run `tools/cardvalue.mjs` (so the AI's card values stay accurate), then `npm run sim`.

## Ideas not built yet

- Shared card pool with limited copies, so players compete for a resource in free-for-all.
- 8-player matches run about 17 rounds (`tools/ffa.mjs`). If that feels long, scale damage with the number of players alive.
- Item and artifact slots (Auto Gladiators' equipment layer).
- Online play has been tested between browser pages on one machine (`tools/mptest.cjs`), not yet between two real networks.
- Rejoining after a disconnect (today a bot takes over permanently).
