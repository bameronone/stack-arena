# Design notes

## Core loop

1. **Ban:** each player secretly bans one resource. Banned resources leave the card pool, along with every hybrid and counter card that uses them.
2. **Pick:** gladiators whose resources are *all* banned are hidden. Two-resource gladiators with one banned stay pickable, with a warning.
3. **Rounds:**
   - Gold arrives: `min(10, 4 + round)` plus interest of 1 per 10 banked (max 2).
   - The shop shows 5 cards. Reroll costs 1 gold, you can lock the shop, and sold cards refund half.
   - Then the auto fight.
   - The loser takes `1 + ceil(0.8 × round) + 4 × winner's HP%` damage. Each player starts with 60 HP.
4. **Round 7:** each player picks one of two signature upgrades for their gladiator.

## Triggers and resources

- **Triggers** (Strike, Precision, Evasion, Pain, Spell) decide when stacks are gained. Each card with a trigger tag also gives a small passive that makes the trigger happen more often:
  - Strike: +1% attack speed
  - Precision: +1% crit
  - Evasion: +2% Focus per hit taken
  - Pain: +1% max HP
  - Spell: +1 mana per attack
- **Resources** (Fire, Frost, Poison, Bleed, Shield, Regen, Mana, Armor) decide what stacks do.
- **Generator cards** pair a trigger with a resource and always fire. Cards with only a resource tag that make stacks fire 30% of the time, or run on a slow timer. That split, taken from Auto Gladiators' gathering and spender sects, is what pushes players into two-tag builds.

## Tiers

- Owning 4, 9 or 15 cards that share a tag unlocks that tag's Uncommon, Rare or Mythic cards.
- A Hybrid needs 5 cards in each of its two resources.
- Shop weight grows with the number of cards you own of a card's tags (up to 3x) and is 1.5x for your gladiator's tags.

## Evasion (Focus)

- Dodge chance starts at 0.
- Each hit you take adds your Focus gain (8% innate on Wisp Dancer, +2% per Evasion card, +3% per Light Feet). A dodge resets Focus to 0.
- Focus is checked *before* it grows, so you can never dodge twice in a row. At +10% per hit, that comes to about 21.5% of attacks dodged.
- Focus is capped at 60%.
- Counterplay:
  - Dodged attacks still fire the attacker's on-attack (Strike) effects.
  - Poison, Bleed and abilities can't be dodged.
  - True Sight makes every 3rd attack undodgeable.
  - Unsettling Blows drains Focus.

## Fights

- The simulation runs at 20 ticks per second and is seeded, so replays are deterministic.
- After 30s, all damage ramps up by 8% per second.
- Hard cap at 90s; if it's reached, higher HP% wins.
- Pain triggers once for every 6% of max HP lost.

## Balance status

These are 2000-match bot-vs-bot results. Bots commit to their gladiator's tags and buy counters when the enemy has 6+ cards of a resource.

- **Characters:** every gladiator wins 42–58%.
- **Resources:** each lands between 43% and 54%. Mana is the weakest; it only pays off on Spell gladiators.
- **Average match:** about 11 rounds, with fights of about 16s.

The bot is simple, so treat these as relative signals rather than ground truth. Run `npm run sim` after any change.

## Ideas not built yet

- Shared card pool with limited copies, so players compete for a resource once there are 3+ players.
- Item and artifact slots (Auto Gladiators' equipment layer).
- Multiplayer: the match state is plain JSON and the fight is deterministic from the seed, so a server only needs to relay shop actions.
