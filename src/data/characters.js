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
    stats: { hp: 660, ad: 30, as: 1.1 },
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
    stats: { hp: 640, ad: 26, manaMax: 85 },
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
    stats: { hp: 670, ad: 27, crit: 0.15 },
    innate: { desc: 'Crits apply 2 Poison and 2 Bleed.', onCrit: (f, u) => { f.apply(u, 'poison', 2); f.apply(u, 'bleed', 2); } },
    ability: { name: 'Fang Flurry', desc: () => 'Make 3 quick attacks.',
      cast: (f, u) => { for (let i = 0; i < 3; i++) { if (u.sig === 'viper_lacerate') u.forceCrit += 1; f.queueExtraAttack(u); } } },
    signatures: [
      { id: 'viper_neuro', name: 'Neurotoxin', desc: 'Poison and Bleed deal +25% damage.', setup: (u) => { u.m.poisonDmg += 0.25; u.m.bleedDmg += 0.25; } },
      { id: 'viper_lacerate', name: 'Lacerate', desc: 'Fang Flurry attacks always crit.' },
    ],
  },
  {
    id: 'wisp', name: 'Wisp Dancer', epithet: 'Never Where You Strike', trigger: 'evasion', resources: ['frost', 'fire'],
    stats: { hp: 620, ad: 28, as: 1.15, focusGain: 0.1 },
    innate: { desc: 'Gains 10% Focus each time she is hit. Each dodge shakes off 4 Poison and 4 Bleed.',
      onEvade: (f, u) => { u.poison = Math.max(0, u.poison - 4); u.bleed = Math.max(0, u.bleed - 4); } },
    ability: { name: 'Mirage', desc: (u) => `Deal 40 + 4 per Fire (${Math.round(40 + 4 * (u?.fire ?? 0))}) and apply 4 Frost. Gain 40% Focus; your next 2 attacks crit.`,
      cast: (f, u, p) => { hit(f, u, (40 + 4 * u.fire) * p); f.apply(u, 'frost', 4); f.gain(u, 'focus', 0.4); u.forceCrit += 2; } },
    signatures: [
      { id: 'wisp_will', name: "Will-o'-Wisp", desc: 'Dodges grant 2 Fire and apply 2 Frost.',
        onEvade: (f, u) => { f.gain(u, 'fire', 2); f.apply(u, 'frost', 2); } },
      { id: 'wisp_mist', name: 'Mistform', desc: 'Focus can reach 70% instead of 60%.', setup: (u) => { u.focusCap = 0.7; } },
    ],
  },
  {
    id: 'martyr', name: 'Iron Martyr', epithet: 'Who Bleeds for Steel', trigger: 'pain', resources: ['armor', 'shield'],
    stats: { hp: 505, ad: 27, as: 0.85 },
    innate: { desc: 'Wounded: gain 1 Armor.', onPain: (f, u) => f.gain(u, 'armor', 1) },
    ability: { name: 'Martyrdom', desc: (u) => `Gain 50 Shield + 10 per Armor (${Math.round(50 + 10 * (u?.armor ?? 0))}).`,
      cast: (f, u, p) => { const s = (50 + 10 * u.armor) * p; f.gain(u, 'shield', s); if (u.sig === 'martyr_penance') hit(f, u, s * 0.4); } },
    signatures: [
      { id: 'martyr_penance', name: 'Penance', desc: 'Martyrdom also deals 40% of the Shield it grants as damage.' },
      { id: 'martyr_unbowed', name: 'Unbowed', desc: 'Start each fight with 6 Armor.', onStart: (f, u) => f.gain(u, 'armor', 6) },
    ],
  },
  {
    id: 'stormseer', name: 'Stormseer', epithet: 'Speaker of Squalls', trigger: 'spell', resources: ['arcane', 'frost'],
    stats: { hp: 520, ad: 24, manaMax: 85 },
    innate: { desc: 'On cast, gain 3 Mana stacks.', onCast: (f, u) => f.gain(u, 'arcane', 3) },
    ability: { name: 'Blizzard', desc: () => 'Deal 75 and apply 5 Frost.',
      cast: (f, u, p) => { hit(f, u, 75 * p); f.apply(u, 'frost', u.sig === 'storm_front' ? 10 : 5); } },
    signatures: [
      { id: 'storm_front', name: 'Storm Front', desc: 'Blizzard applies 10 Frost instead of 5.' },
      { id: 'storm_conduit', name: 'Conduit', desc: '+5 mana per attack.', setup: (u) => { u.manaPerAttack += 5; } },
    ],
  },
  {
    id: 'grove', name: 'Grove Keeper', epithet: 'Rooted', trigger: 'pain', resources: ['regen'],
    stats: { hp: 490, ad: 24, as: 0.9 },
    innate: { desc: 'Start each fight with 1 Regen.', onStart: (f, u) => f.gain(u, 'regen', 1) },
    ability: { name: 'Overgrowth', desc: () => 'Heal 3% of max HP plus 0.5% per Regen.',
      cast: (f, u, p) => {
        const h = u.maxHp * (0.03 + 0.005 * u.regen) * Math.min(p, 1.5);
        const healed = f.heal(u, h, 'Overgrowth');
        if (u.sig === 'grove_thorn') hit(f, u, healed * 0.6);
      } },
    signatures: [
      { id: 'grove_thorn', name: 'Thornroot', desc: 'Overgrowth deals 60% of what it heals as damage.' },
      { id: 'grove_deep', name: 'Deep Roots', desc: '+150 max HP.', setup: (u) => { u.maxHp += 150; } },
    ],
  },
  {
    id: 'ashen', name: 'Ashen Witch', epithet: 'Mother of Smoke', trigger: 'spell', resources: ['fire', 'poison'],
    stats: { hp: 545, ad: 25, manaMax: 90 },
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
    stats: { hp: 580, ad: 31 },
    innate: { desc: 'Heal for 10% of your Bleed damage.', setup: (u) => { u.m.bleedLeech += 0.1; } },
    ability: { name: 'Rupture', desc: (u) => `Deal 20 + 4 per Bleed on the enemy (${Math.round(20 + 4 * (u?.enemy?.bleed ?? 0))}) and heal half of it.`,
      cast: (f, u, p) => {
        const d = hit(f, u, ((u.sig === 'reaver_butcher' ? 6 : 4) * u.enemy.bleed + 20) * p);
        f.heal(u, d * 0.5, 'Rupture');
      } },
    signatures: [
      { id: 'reaver_hemo', name: 'Hemophage', desc: 'Heal for another 25% of your Bleed damage.', setup: (u) => { u.m.bleedLeech += 0.25; } },
      { id: 'reaver_butcher', name: 'Butcher', desc: 'Rupture deals 6 per Bleed instead of 4.' },
    ],
  },
  {
    id: 'sage', name: 'Bulwark Sage', epithet: 'Keeper of Wards', trigger: 'spell', resources: ['shield', 'arcane'],
    stats: { hp: 485, ad: 24, manaMax: 85 },
    innate: { desc: 'All Shield you gain is increased by 15%.', setup: (u) => { u.m.shieldGain += 0.15; } },
    ability: { name: 'Arcane Barrier', desc: () => 'Gain 45 Shield, then deal 30 plus 30% of your Shield as damage.',
      cast: (f, u, p) => { f.gain(u, 'shield', 45 * p * (u.sig === 'sage_overflow' ? 1.5 : 1)); hit(f, u, 30 * p + u.shield * 0.3 * Math.min(p, 1.6)); } },
    signatures: [
      { id: 'sage_rune', name: 'Runeward', desc: 'Start each fight with 50 Shield.', onStart: (f, u) => f.gain(u, 'shield', 50) },
      { id: 'sage_overflow', name: 'Overflow', desc: 'Arcane Barrier grants 50% more Shield.' },
    ],
  },
  {
    id: 'duelist', name: 'Brass Duelist', epithet: 'First Blade of the Pit', trigger: 'precision', resources: ['fire', 'armor'],
    stats: { hp: 560, ad: 33, crit: 0.14 },
    innate: { desc: 'Crits grant 1 Armor and 3 Fire.', onCrit: (f, u) => { f.gain(u, 'armor', 1); f.gain(u, 'fire', 3); } },
    ability: { name: 'Lunge', desc: (u) => `Deal 70 + 5 per Armor and Fire (${Math.round(70 + 5 * ((u?.armor ?? 0) + (u?.fire ?? 0)))}). Your next attack crits.`,
      cast: (f, u, p) => { hit(f, u, (70 + 5 * (u.armor + u.fire)) * p); u.forceCrit += 1; } },
    signatures: [
      { id: 'duelist_tempo', name: 'Steel Tempo', desc: 'Crits grant 3 more Fire.', onCrit: (f, u) => f.gain(u, 'fire', 3) },
      { id: 'duelist_guard', name: 'Guard Stance', desc: 'Start each fight with 5 Armor.', onStart: (f, u) => f.gain(u, 'armor', 5) },
    ],
  },
  {
    id: 'nightshade', name: 'Nightshade', epithet: 'Smoke and Needles', trigger: 'evasion', resources: ['poison', 'shield'],
    stats: { hp: 580, ad: 25, as: 1.1, focusGain: 0.045 },
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
