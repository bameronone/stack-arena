# Design notes

## Core loop

0. **Lobby:** 2 to 8 players (you plus 1 to 7 bots). Two players is a duel; more is a free-for-all. The last gladiator standing wins; everyone else gets a placement in the order they're knocked out.
1. **Ban:** each player secretly votes to ban one resource. The two most-voted resources are banned, with ties broken at random (in a duel that's simply both picks). Banned resources leave the card pool, along with every hybrid and counter card that uses them.
2. **Pick:** a gladiator sits the match out if *any* of its resources is banned. Online, a player whose page is a different build from the host's is refused at the door, so an old tab can't show old ban rules.
3. **Timers** (online always, solo optional): ban 20s, pick 30s, signature 20s, shop 20/30/45s. Running out picks at random or starts the fight. In multiplayer the fight starts early once every living player has pressed Ready.
4. **Rounds:**
   - Cards cost their rarity: Common 1, Uncommon 2, Rare 3, Mythic 4 (Hybrid 3, Counter 1). They used to cost 2/3/4/6.
   - Gold arrives: `min(6, 2 + ceil(round / 2))` plus interest of 1 per 4 banked (max 2, at 8 gold). It was `min(10, 4 + round)` with 1 per 5 (max 3) when cards cost 2-6; it was cut with the costs so a match still ends with about 44 cards.
   - The shop shows 5 cards. Reroll costs 1 gold and you can lock the shop. There is no selling: every purchase is permanent. The shop stays open while the round's fights play out: cards bought then are queued and join your build when the round ends, so they never change a fight in progress. Interest counts the gold you have left when the next round starts.
   - Then the auto fights. Pairings are random each round, avoiding last round's opponent where possible. With an odd number alive, one player fights a **ghost**: a copy of another living player's build. Losing to a ghost costs HP; beating one doesn't hurt the player it copies.
   - In the browser, your fight is animated. Every other fight of the round plays out on a shared clock at 2x, and you can watch any of them from the standings wall (it replays from the shared seed). There is no results popup: the next round starts by itself once every fight has played out and every player has finished watching their own. Once no human is left alive, the bots finish the match instantly and you see the final standings.
   - The loser takes `1 + ceil(0.8 × round) + 4 × winner's HP%` damage. Each player starts with 60 HP.
   - Every gladiator's base HP was tripled in round 5 of the design (fights run about twice as long; median ~16s, about a quarter reach overtime in bot play).
   - Gladiators' fight HP grows each round: max HP × `1 + 0.015 × (round − 1)²` (1.24x in round 5, 2.5x in round 11, 3.5x in round 14). Without it, late fights ended in about 4s, often in one cast. Effects worth a percent of max HP (bleed, regen, Juggernaut, shields...) use the HP before scaling, so they don't outgrow everything else.
   - The shop shows next round's gold: income plus interest, and how much more to keep for the next interest step.
5. **Round 7:** each player picks one of two signature upgrades for their gladiator.

## Triggers and resources

- **Triggers** (Strike, Precision, Evasion, Health, Spell) decide when stacks are gained. Owning cards with a trigger tag makes that trigger happen more often:
  - Strike: +3% attack damage per card
  - Precision: +1% crit per card
  - Evasion: +5% Focus per hit taken per card
  - Health (internally `pain`, formerly Wounded): +5 max HP per card, and "When hurt" fires every 12% of max HP lost, 0.5% sooner per card (min 4%). The max-HP cards (Hearty, Juggernaut, Titan) are Health cards.
  - Spell: +0.5 mana per attack per card
- **Resources** (Fire, Frost, Toxin, Bleed, Shield, Regen, Arcane, Lightning, Armor) decide what stacks do. Arcane was called Mana; it was renamed so it isn't confused with the mana bar every gladiator fills to cast.
  - Lightning stacks on you (so cards say *gain* Lightning); every 10 call a bolt down on the enemy (40 damage, +5 per earlier bolt this fight, up to +100) that ignores Armor and stutters the enemy's attack: their swing is pushed back a quarter of a swing, and one swing is never pushed back more than half a swing in total, however many bolts land at once. The swing timer under each fighter's mana bar shows attacks per second, and in red the seconds a bolt added to the current swing.
  - Toxin (internally `poison`, formerly Poison) goes through Armor but Shield blocks it. It no longer cuts healing.
  - Regen heals 0.25% of base max HP per second per stack and, like Toxin and Bleed, loses a third of its stacks every 2s (it used to last the whole fight at 0.2%, so cards now give about 2.5x as much). Every 5% of base max HP healed, from any source, fires "On heal" (Sap Ward, Bloom Burst, Evergreen).
  - Gaining Fire melts the same number of Frost stacks on you.
  - Fire: +1% attack speed per stack, up to 40 (your Fire cap). Reaching the cap sets off **Afterburner**: all your Fire burns out and for 3s you attack twice as fast and every hit scorches for another 30% of its damage. Burning more than 40 (Stoke, Wildheart) makes it last longer; Cooling Draught makes the enemy's shorter.
  - Toxin and Bleed lose a third of their stacks every 2 seconds (Deep Cuts and Arterial Strike slow or stop it for Bleed).
- **Generator cards** pair a trigger with a resource and always fire. There's one for every one of the 40 trigger-resource pairs. Cards with only a resource tag that make stacks fire 30% of the time, or run on a slow timer.

## Tiers

- Owning 4, 9 or 15 cards that share a tag unlocks that tag's Uncommon, Rare or Mythic cards.
- A Hybrid needs 5 cards in each of its two resources.
- Shop weight grows with the number of cards you own of a card's tags (up to 3x) and is 1.5x for your gladiator's tags.
- There is no selling. Every purchase is permanent.

## Evasion (Focus)

- Dodge chance starts at 0.
- Each hit you take adds your Focus gain (18% innate on Haze, 9% on Nightshade, +5% per Evasion card, +3% per Light Feet). A dodge resets Focus to 0.
- Focus is checked *before* it grows, so you can never dodge twice in a row. At +10% per hit, that comes to about 21.5% of attacks dodged.
- Focus is capped at 60%.
- Counterplay:
  - Dodged attacks still fire the attacker's on-attack (Strike) effects.
  - Toxin, Bleed and abilities can't be dodged.
  - True Sight makes every 4th attack undodgeable.
  - Unsettling Blows drains 10% of the target's Focus per copy.
  - Haze sheds 4 Toxin and 4 Bleed on each dodge, so evasion still has an answer to damage over time.

## Fights

- The simulation runs at 20 ticks per second and is seeded, so replays are deterministic.
- Frost freezes at 16 stacks, and each freeze a gladiator suffers needs 10 more Frost than the last. Frost can't build up on a frozen gladiator, so a fast Frost build can't chain freezes back to back.
- Grit (everyone): losing 30% of max HP within 2s halves damage taken for 1.5s, at most once every 6s. Steadfast (counter) makes it stronger.
- Mana fills continuously at mana-per-attack times attack speed, instead of in chunks on each hit.
- Every ability scales with something that grows during the fight (stacks on either side, bolts called, Armor, Shield).
- Armor blocks 1.25 damage per stack from each attack.
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

- **Characters:** base HP follows body type (`HP_BANDS` in `characters.js`): brawny 2200–3000 (Anvil, Brakka, Aldric, Bram, Mordrek), medium 1750–2150, slight 1300–1700, so the big armored gladiators are the toughest. Kits are balanced around that: `tools/autotune.mjs` moves HP only inside the band and puts the rest into ability power (`stats.ap`, 50–150%, shown on the pick screen), and outliers got kit changes by hand. Every gladiator wins 46–55% over 4000 bot matches.
- **Resources:** 48–53%. Toxin loses a third of its stacks every 2s so it levels off instead of snowballing.
- **Average match:** about 11 rounds, with fights of about 15s that stay that long into the late game.

After changing cards, re-run `tools/cardvalue.mjs` (so the AI's card values stay accurate), then `npm run sim`.

## Ideas not built yet

- Shared card pool with limited copies, so players compete for a resource in free-for-all.
- 8-player matches run about 17 rounds (`tools/ffa.mjs`). If that feels long, scale damage with the number of players alive.
- Item and artifact slots (Auto Gladiators' equipment layer).
- Online play has been tested between browser pages on one machine (`tools/mptest.cjs`), not yet between two real networks.
- Rejoining after a disconnect (today a bot takes over permanently).

## Multiplayer flow

- Everyone starts with 3 gold on top of round 1's income.
- Your own fight replays in the host's pair order (it sets the seed and who acts first), drawn mirrored when you are the second fighter, so it always matches the result the host applied.
- The fight phase ends once every fight has played out at 2x and every human has finished watching their own (sent automatically when their fight ends). If someone holds it up, it is forced on 8 seconds after the longest fight would finish at 1x (at most 120s). Watching another fight stops when the round ends.
- After a match: **Replay** starts the same lobby (solo) or room (host) again straight away; **Back to lobby** returns to the setup or the room to change it.
- A player who leaves is replaced by a bot; joining the same room code again (same browser, or same name) hands the gladiator back.
- In a free-for-all your next opponent stays hidden (top bar, side panel and arena preview) until the fight starts.
- Standings sit in a grey bar along the top of the arena, next to the speed buttons, best on the left, sliding when places change. Each plaque shows the player's gladiator and its tags. An eye marks a fight you can watch (click it to watch; it lights up while you do); crossed swords mark other fights still going. Knocked-out players keep spectating: rounds still play out in real time, they watch the leader's fight automatically, and Skip to results fast-forwards the rest of the match once every human has skipped.
