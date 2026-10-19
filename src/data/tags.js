// Tags come in two kinds. Triggers decide WHEN stacks are gained; resources
// decide WHAT the stacks do. Only resources can be banned.
export const TAGS = {
  strike:    { name: 'Strike',    kind: 'trigger',  color: '#c9b79c', glyph: 'St', passive: '+3% attack damage per Strike card' },
  precision: { name: 'Precision', kind: 'trigger',  color: '#f2d16b', glyph: 'Pr', passive: '+1% crit chance per Precision card' },
  evasion:   { name: 'Evasion',   kind: 'trigger',  color: '#9fd8cb', glyph: 'Ev', passive: '+5% Focus per hit taken per Evasion card' },
  pain:      { name: 'Health',    kind: 'trigger',  color: '#d9707a', glyph: 'He', passive: '+5 max HP per Health card. "When hurt" fires each time you lose 12% of your max HP, 0.5% sooner per Health card (min every 4%)' },
  spell:     { name: 'Spell',     kind: 'trigger',  color: '#b59cf0', glyph: 'Sp', passive: '+0.5 mana per attack per Spell card' },

  fire:   { name: 'Fire',   kind: 'resource', color: '#f07a3a', glyph: 'Fi', stack: '+1% attack speed per stack, up to 40. At 40, Afterburner: all your Fire burns out and for 3s you attack twice as fast and every hit scorches for 30% more. Fades after 3s without gaining any.' },
  frost:  { name: 'Frost',  kind: 'resource', color: '#6cc4f0', glyph: 'Fr', stack: 'On the enemy: -1.5% attack speed and mana gain per stack. At 16 they freeze for 1.5s, and each freeze they suffer needs 10 more Frost than the last. No Frost builds up while they are frozen. Gaining Fire melts Frost on you, stack for stack.' },
  poison: { name: 'Toxin',  kind: 'resource', color: '#8fd14f', glyph: 'To', stack: 'On the enemy: 1 damage per second per stack. Goes through Armor, but Shield blocks it. Loses a third of its stacks every 2s.' },
  bleed:  { name: 'Bleed',  kind: 'resource', color: '#e0445a', glyph: 'Bl', stack: 'On the enemy: 0.25% of their max HP per second per stack. Loses a third of its stacks every 2s.' },
  shield: { name: 'Shield', kind: 'resource', color: '#e9eef5', glyph: 'Sh', stack: 'Absorbs damage before HP, Toxin and Bleed included.' },
  regen:  { name: 'Regen',  kind: 'resource', color: '#5fd69a', glyph: 'Re', stack: 'Heals 0.2% of max HP per second per stack. Every 5% of max HP you heal, from any source, fires "On heal".' },
  arcane: { name: 'Arcane', kind: 'resource', color: '#5b8cff', glyph: 'Ar', stack: 'On you: +4% ability power per stack (counts up to 25). Not the same as the mana bar every gladiator fills to cast. Abilities ignore armor and cannot be dodged.' },
  lightning: { name: 'Lightning', kind: 'resource', color: '#f5e45b', glyph: 'Li', stack: 'On you: you gain it, and every 10 stacks call a bolt down on the enemy for 40 damage, +5 for each bolt already called this fight (up to +100). Bolts ignore Armor and stutter the enemy\'s attack, pushing their next swing back by a quarter (half a swing at most, however many bolts land).' },
  armor:  { name: 'Armor',  kind: 'resource', color: '#a8a39a', glyph: 'Am', stack: '-1.25 damage from every attack per stack (attacks always deal at least 25%).' },
};

export const TRIGGERS = Object.keys(TAGS).filter((t) => TAGS[t].kind === 'trigger');
export const RESOURCES = Object.keys(TAGS).filter((t) => TAGS[t].kind === 'resource');

// Owning this many cards of a tag unlocks that tag's next tier in your shop.
export const TIER_UNLOCK = { 1: 0, 2: 4, 3: 9, 4: 15 };
export const TIER_NAMES = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Mythic', hybrid: 'Hybrid', counter: 'Counter' };
export const CARD_COST = { 1: 2, 2: 3, 3: 4, 4: 6, hybrid: 4, counter: 2 };
export const HYBRID_REQ = 5; // cards needed in EACH of a hybrid's two resources

export function unlockedTier(count) {
  let tier = 1;
  for (const t of [2, 3, 4]) if (count >= TIER_UNLOCK[t]) tier = t;
  return tier;
}
