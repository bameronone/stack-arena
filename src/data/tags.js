// Tags come in two kinds. Triggers decide WHEN stacks are gained; resources
// decide WHAT the stacks do. Only resources can be banned.
export const TAGS = {
  strike:    { name: 'Strike',    kind: 'trigger',  color: '#c9b79c', glyph: 'St', passive: '+1% attack speed per Strike card' },
  precision: { name: 'Precision', kind: 'trigger',  color: '#f2d16b', glyph: 'Pr', passive: '+1% crit chance per Precision card' },
  evasion:   { name: 'Evasion',   kind: 'trigger',  color: '#9fd8cb', glyph: 'Ev', passive: '+3% Focus per hit taken per Evasion card' },
  pain:      { name: 'Health',    kind: 'trigger',  color: '#d9707a', glyph: 'He', passive: '+5 max HP per Health card. "When hurt" fires each time you lose 12% of your max HP, 0.5% sooner per Health card (min every 4%)' },
  spell:     { name: 'Spell',     kind: 'trigger',  color: '#b59cf0', glyph: 'Sp', passive: '+0.5 mana per attack per Spell card' },

  fire:   { name: 'Fire',   kind: 'resource', color: '#f07a3a', glyph: 'Fi', stack: '+2.5% attack speed per stack (cap 25). Fades after 3s without gaining any.' },
  frost:  { name: 'Frost',  kind: 'resource', color: '#6cc4f0', glyph: 'Fr', stack: 'On the enemy: -1.5% attack speed and mana gain per stack. At 16 they freeze for 1.5s. Gaining Fire melts Frost on you, stack for stack.' },
  poison: { name: 'Toxin',  kind: 'resource', color: '#8fd14f', glyph: 'To', stack: 'On the enemy: 1 damage per second per stack. Goes through Armor, but Shield blocks it. Each stack cuts their healing 1% (max 50%). Loses 2% of its stacks each second.' },
  bleed:  { name: 'Bleed',  kind: 'resource', color: '#e0445a', glyph: 'Bl', stack: 'On the enemy: 0.25% of their max HP per second per stack. Loses 8% of its stacks each second.' },
  shield: { name: 'Shield', kind: 'resource', color: '#e9eef5', glyph: 'Sh', stack: 'Absorbs damage before HP, Toxin and Bleed included.' },
  regen:  { name: 'Regen',  kind: 'resource', color: '#5fd69a', glyph: 'Re', stack: 'Heals 0.2% of max HP per second per stack. Every 5% of max HP you heal, from any source, fires "On heal".' },
  arcane: { name: 'Mana',   kind: 'resource', color: '#5b8cff', glyph: 'Ma', stack: '+4% ability power per stack. Abilities ignore armor and cannot be dodged.' },
  armor:  { name: 'Armor',  kind: 'resource', color: '#a8a39a', glyph: 'Ar', stack: '-1.25 damage from every attack per stack (attacks always deal at least 25%).' },
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
