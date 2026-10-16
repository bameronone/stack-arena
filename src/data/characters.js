// Gladiators. Each has a signature trigger, one or two resource affinities,
// an innate passive, an ability cast at full mana, and two signature upgrades
// offered at the milestone round.
//
// A character is hidden when ALL of its resources are banned. Characters with
// two resources and one banned stay pickable but get a warning.

const hit = (f, u, amount) => f.damage(u, u.enemy, amount, 'ability');

export const CHARACTERS = [
  {
    id: 'cinder', name: 'Cinder', epithet: 'the Kindled', trigger: 'strike', resources: ['fire'],
    stats: { hp: 530, ad: 29, as: 1.1 },
    innate: { desc: 'On attack, gain 1 Fire.', onAttack: (f, u) => f.gain(u, 'fire', 1) },
    ability: { name: 'Blaze Rush', desc: (u) => `Deal 50 + 5 per Fire (${Math.round(50 + 5 * (u?.fire ?? 0))}).`,
      cast: (f, u, p) => { const d = (50 + 5 * u.fire) * p; hit(f, u, d); if (u.sig === 'cinder_twin') hit(f, u, d * 0.6); } },
    signatures: [
      { id: 'cinder_wild', name: 'Wildheart', desc: 'Fire cap +12.', setup: (u) => { u.fireCap += 12; } },
      { id: 'cinder_twin', name: 'Twin Blaze', desc: 'Blaze Rush hits a second time for 60%.' },
    ],
  },
  {
    id: 'glacia', name: 'Glacia', epithet: 'of the Long Winter', trigger: 'spell', resources: ['frost'],
    stats: { hp: 610, ad: 27, manaMax: 80 },
    innate: { desc: 'Your casts apply 4 extra Frost.', onCast: (f, u) => f.apply(u, 'frost', 4) },
    ability: { name: 'Hailstorm', desc: () => 'Deal 55 and apply 8 Frost, plus 1 per 3 Frost already on the enemy.',
      cast: (f, u, p) => {
        const bonus = u.sig === 'glacia_lance' && u.enemy.frozen > 0 ? 2 : 1;
        hit(f, u, 55 * p * bonus);
        f.apply(u, 'frost', Math.round((8 + Math.floor(u.enemy.frost / 3)) * Math.min(p, 1.6)));
      } },
    signatures: [
      { id: 'glacia_heart', name: 'Glacier Heart', desc: 'The enemy freezes 4 Frost sooner.', setup: (u) => { u.freezeAt -= 4; } },
      { id: 'glacia_lance', name: 'Ice Lance', desc: 'Hailstorm deals double damage to frozen enemies.' },
    ],
  },
  {
    id: 'viper', name: 'Viper Saint', epithet: 'Twice-Fanged', trigger: 'precision', resources: ['poison', 'bleed'],
    stats: { hp: 590, ad: 28, crit: 0.15 },
    innate: { desc: 'Crits apply 3 Poison and 3 Bleed.', onCrit: (f, u) => { f.apply(u, 'poison', 3); f.apply(u, 'bleed', 3); } },
    ability: { name: 'Fang Flurry', desc: () => 'Make 3 quick attacks.',
      cast: (f, u) => { for (let i = 0; i < 3; i++) { if (u.sig === 'viper_lacerate') u.forceCrit += 1; f.queueExtraAttack(u); } } },
    signatures: [
      { id: 'viper_neuro', name: 'Neurotoxin', desc: 'Poison and Bleed deal +25% damage.', setup: (u) => { u.m.poisonDmg += 0.25; u.m.bleedDmg += 0.25; } },
      { id: 'viper_lacerate', name: 'Lacerate', desc: 'Fang Flurry attacks always crit.' },
    ],
  },
  {
    id: 'wisp', name: 'Wisp Dancer', epithet: 'Never Where You Strike', trigger: 'evasion', resources: ['frost', 'fire'],
    stats: { hp: 580, ad: 27, as: 1.15, focusGain: 0.08 },
    innate: { desc: 'Gains 8% Focus each time she is hit, so she dodges on a steady rhythm.' },
    ability: { name: 'Mirage', desc: () => 'Gain 40% Focus. Your next 2 attacks crit.',
      cast: (f, u) => { f.gain(u, 'focus', 0.4); u.forceCrit += 2; } },
    signatures: [
      { id: 'wisp_will', name: "Will-o'-Wisp", desc: 'Dodges grant 2 Fire and apply 2 Frost.',
        onEvade: (f, u) => { f.gain(u, 'fire', 2); f.apply(u, 'frost', 2); } },
      { id: 'wisp_mist', name: 'Mistform', desc: 'Focus can reach 70% instead of 60%.', setup: (u) => { u.focusCap = 0.7; } },
    ],
  },
  {
    id: 'martyr', name: 'Iron Martyr', epithet: 'Who Bleeds for Steel', trigger: 'pain', resources: ['armor', 'shield'],
    stats: { hp: 650, ad: 26, as: 0.85 },
    innate: { desc: 'Pain: gain 1 Armor.', onPain: (f, u) => f.gain(u, 'armor', 1) },
    ability: { name: 'Martyrdom', desc: (u) => `Gain 40 Shield + 8 per Armor (${Math.round(40 + 8 * (u?.armor ?? 0))}).`,
      cast: (f, u, p) => { const s = (40 + 8 * u.armor) * p; f.gain(u, 'shield', s); if (u.sig === 'martyr_penance') hit(f, u, s * 0.4); } },
    signatures: [
      { id: 'martyr_penance', name: 'Penance', desc: 'Martyrdom also deals 40% of the Shield it grants as damage.' },
      { id: 'martyr_unbowed', name: 'Unbowed', desc: 'Start each fight with 6 Armor.', onStart: (f, u) => f.gain(u, 'armor', 6) },
    ],
  },
  {
    id: 'stormseer', name: 'Stormseer', epithet: 'Speaker of Squalls', trigger: 'spell', resources: ['arcane', 'frost'],
    stats: { hp: 610, ad: 25, manaMax: 75 },
    innate: { desc: 'On cast, gain 3 Mana stacks.', onCast: (f, u) => f.gain(u, 'arcane', 3) },
    ability: { name: 'Blizzard', desc: () => 'Deal 100 and apply 5 Frost.',
      cast: (f, u, p) => { hit(f, u, 100 * p); f.apply(u, 'frost', u.sig === 'storm_front' ? 10 : 5); } },
    signatures: [
      { id: 'storm_front', name: 'Storm Front', desc: 'Blizzard applies 10 Frost instead of 5.' },
      { id: 'storm_conduit', name: 'Conduit', desc: '+5 mana per attack.', setup: (u) => { u.manaPerAttack += 5; } },
    ],
  },
  {
    id: 'grove', name: 'Grove Keeper', epithet: 'Rooted', trigger: 'pain', resources: ['regen'],
    stats: { hp: 600, ad: 24, as: 0.9 },
    innate: { desc: 'Start each fight with 2 Regen.', onStart: (f, u) => f.gain(u, 'regen', 2) },
    ability: { name: 'Overgrowth', desc: () => 'Heal 4% of max HP plus 0.7% per Regen.',
      cast: (f, u, p) => {
        const h = u.maxHp * (0.04 + 0.007 * u.regen) * Math.min(p, 1.5);
        const healed = f.heal(u, h);
        if (u.sig === 'grove_thorn') hit(f, u, healed * 0.6);
      } },
    signatures: [
      { id: 'grove_thorn', name: 'Thornroot', desc: 'Overgrowth deals 60% of what it heals as damage.' },
      { id: 'grove_deep', name: 'Deep Roots', desc: '+150 max HP.', setup: (u) => { u.maxHp += 150; } },
    ],
  },
  {
    id: 'ashen', name: 'Ashen Witch', epithet: 'Mother of Smoke', trigger: 'spell', resources: ['fire', 'poison'],
    stats: { hp: 540, ad: 25, manaMax: 90 },
    innate: { desc: 'On cast, gain 5 Fire.', onCast: (f, u) => f.gain(u, 'fire', 5) },
    ability: { name: 'Cinderplague', desc: () => 'Deal 30 and apply 8 Poison plus 1 per 2 Fire.',
      cast: (f, u, p) => { hit(f, u, 30 * p); f.apply(u, 'poison', Math.round((8 + u.fire / 2) * p)); } },
    signatures: [
      { id: 'ashen_kindled', name: 'Kindled Plague', desc: 'Your Poison deals +30% damage.', setup: (u) => { u.m.poisonDmg += 0.3; } },
      { id: 'ashen_pyre', name: 'Pyre', desc: 'Cinderplague costs 25% less mana.', setup: (u) => { u.m.castCost *= 0.75; } },
    ],
  },
  {
    id: 'reaver', name: 'Bloodreaver', epithet: 'the Red Harvest', trigger: 'strike', resources: ['bleed', 'regen'],
    stats: { hp: 700, ad: 32 },
    innate: { desc: 'Heal for 15% of your Bleed damage.', setup: (u) => { u.m.bleedLeech += 0.15; } },
    ability: { name: 'Rupture', desc: (u) => `Deal 30 + 5 per Bleed on the enemy (${Math.round(30 + 5 * (u?.enemy?.bleed ?? 0))}) and heal half of it.`,
      cast: (f, u, p) => {
        const d = hit(f, u, ((u.sig === 'reaver_butcher' ? 7 : 5) * u.enemy.bleed + 30) * p);
        f.heal(u, d * 0.5);
      } },
    signatures: [
      { id: 'reaver_hemo', name: 'Hemophage', desc: 'Heal for another 25% of your Bleed damage.', setup: (u) => { u.m.bleedLeech += 0.25; } },
      { id: 'reaver_butcher', name: 'Butcher', desc: 'Rupture deals 7 per Bleed instead of 5.' },
    ],
  },
  {
    id: 'sage', name: 'Bulwark Sage', epithet: 'Keeper of Wards', trigger: 'spell', resources: ['shield', 'arcane'],
    stats: { hp: 640, ad: 25, manaMax: 80 },
    innate: { desc: 'All Shield you gain is increased by 15%.', setup: (u) => { u.m.shieldGain += 0.15; } },
    ability: { name: 'Arcane Barrier', desc: () => 'Gain 60 Shield, then deal 40 plus 35% of your Shield as damage.',
      cast: (f, u, p) => { f.gain(u, 'shield', 60 * p * (u.sig === 'sage_overflow' ? 1.5 : 1)); hit(f, u, 40 * p + u.shield * 0.35 * Math.min(p, 1.6)); } },
    signatures: [
      { id: 'sage_rune', name: 'Runeward', desc: 'Start each fight with 50 Shield.', onStart: (f, u) => f.gain(u, 'shield', 50) },
      { id: 'sage_overflow', name: 'Overflow', desc: 'Arcane Barrier grants 50% more Shield.' },
    ],
  },
  {
    id: 'duelist', name: 'Brass Duelist', epithet: 'First Blade of the Pit', trigger: 'precision', resources: ['fire', 'armor'],
    stats: { hp: 630, ad: 31, crit: 0.14 },
    innate: { desc: 'Crits grant 1 Armor.', onCrit: (f, u) => f.gain(u, 'armor', 1) },
    ability: { name: 'Lunge', desc: (u) => `Deal 60 + 4 per Armor and Fire (${Math.round(60 + 4 * ((u?.armor ?? 0) + (u?.fire ?? 0)))}).`,
      cast: (f, u, p) => hit(f, u, (60 + 4 * (u.armor + u.fire)) * p) },
    signatures: [
      { id: 'duelist_tempo', name: 'Steel Tempo', desc: 'Crits also grant 3 Fire.', onCrit: (f, u) => f.gain(u, 'fire', 3) },
      { id: 'duelist_guard', name: 'Guard Stance', desc: 'Start each fight with 5 Armor.', onStart: (f, u) => f.gain(u, 'armor', 5) },
    ],
  },
  {
    id: 'nightshade', name: 'Nightshade', epithet: 'Smoke and Needles', trigger: 'evasion', resources: ['poison', 'shield'],
    stats: { hp: 520, ad: 24, as: 1.1, focusGain: 0.045 },
    innate: { desc: 'Gains 4.5% Focus each time she is hit. Dodges apply 2 Poison.', onEvade: (f, u) => f.apply(u, 'poison', 2) },
    ability: { name: 'Smoke Veil', desc: () => 'Gain 25% Focus and 30 Shield, and apply 6 Poison.',
      cast: (f, u, p) => { f.gain(u, 'focus', 0.25); f.gain(u, 'shield', 30 * p); f.apply(u, 'poison', Math.round(6 * p)); } },
    signatures: [
      { id: 'shade_needles', name: 'Needle Rain', desc: 'Dodges apply 4 more Poison.', onEvade: (f, u) => f.apply(u, 'poison', 4) },
      { id: 'shade_veil', name: 'Thick Smoke', desc: 'Start each fight with 30% Focus.', setup: (u) => { u.focusStart += 0.3; } },
    ],
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

// Visibility after bans. Returns 'hidden', 'weakened' or 'ok'.
export function characterStatus(char, bans) {
  const left = char.resources.filter((r) => !bans.includes(r));
  if (left.length === 0) return 'hidden';
  if (left.length < char.resources.length) return 'weakened';
  return 'ok';
}
