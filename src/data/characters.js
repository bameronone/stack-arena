// Gladiators. Each has a signature trigger, one or two resource affinities,
// an innate passive, an ability cast at full mana, and two signature upgrades
// offered at the milestone round.
//
// A character is hidden when ANY of its resources is banned.

const hit = (f, u, amount) => f.damage(u, u.enemy, amount, 'ability');
const fangs = (u) => Math.min(8, 3 + Math.floor(((u?.enemy?.poison ?? 0) + (u?.enemy?.bleed ?? 0)) / 12));

// Base HP follows body type, so the big armored brawlers are the toughest.
// Kits are balanced around it (tools/autotune.mjs moves HP only inside the
// band, plus ability power: stats.ap, 1 = 100%).
export const HP_BANDS = { brawny: [2200, 3000], medium: [1750, 2150], slight: [1300, 1700] };

export const CHARACTERS = [
  {
    id: 'cinder', name: 'Cinder', epithet: 'the Kindled', trigger: 'strike', resources: ['fire'],
    body: 'medium',
    stats: { hp: 2080, ad: 30, as: 1.2, ap: 1.46 },
    innate: { desc: 'On attack, gain 2 Fire.', onAttack: (f, u) => f.gain(u, 'fire', 2) },
    ability: { name: 'Blaze Rush', desc: (u) => `Deal 60 + 6 per Fire (${Math.round(60 + 6 * (u?.fire ?? 0))}).`,
      cast: (f, u, p) => { const d = (60 + 6 * u.fire) * p; hit(f, u, d); if (u.sig === 'cinder_twin') hit(f, u, d * 0.6); } },
    signatures: [
      { id: 'cinder_wild', name: 'Wildheart', desc: 'Fire cap +12, so Afterburner waits longer and burns more.', setup: (u) => { u.fireCap += 12; } },
      { id: 'cinder_twin', name: 'Twin Blaze', desc: 'Blaze Rush hits a second time for 60%.' },
    ],
  },
  {
    id: 'glacia', name: 'Glacia', epithet: 'of the Long Winter', trigger: 'spell', resources: ['frost'],
    body: 'medium',
    stats: { hp: 1870, ad: 26, manaMax: 85 },
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
    id: 'viper', name: 'Twinfang', epithet: 'the Coiled Blade', trigger: 'precision', resources: ['poison', 'bleed'],
    body: 'medium',
    stats: { hp: 2150, ad: 27, crit: 0.17, ap: 1.5 },
    innate: { desc: 'Crits apply 2 Toxin and 2 Bleed.', onCrit: (f, u) => { f.apply(u, 'poison', 2); f.apply(u, 'bleed', 2); } },
    ability: { name: 'Fang Flurry', desc: (u) => `Make 3 quick attacks, plus 1 per 12 Toxin and Bleed on the enemy, up to 8 (${fangs(u)}).`,
      cast: (f, u) => { const k = fangs(u); for (let i = 0; i < k; i++) { if (u.sig === 'viper_lacerate') u.forceCrit += 1; f.queueExtraAttack(u); } } },
    signatures: [
      { id: 'viper_neuro', name: 'Neurotoxin', desc: 'Toxin and Bleed deal +25% damage.', setup: (u) => { u.m.poisonDmg += 0.25; u.m.bleedDmg += 0.25; } },
      { id: 'viper_lacerate', name: 'Lacerate', desc: 'Fang Flurry attacks always crit.' },
    ],
  },
  {
    id: 'wisp', name: 'Haze', epithet: 'Never Where You Strike', trigger: 'evasion', resources: ['frost', 'fire'],
    body: 'slight',
    stats: { hp: 1700, ad: 28, as: 1.15, focusGain: 0.14, ap: 1.5 },
    innate: { desc: 'Gains 14% Focus each time she is hit. Each dodge shakes off 4 Toxin and 4 Bleed.',
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
    id: 'martyr', name: 'Anvil', epithet: 'Who Bleeds for Steel', trigger: 'pain', resources: ['armor', 'shield'],
    body: 'brawny',
    stats: { hp: 2700, ad: 27, as: 0.85, ap: 1.36 },
    innate: { desc: 'When hurt: gain 1 Armor.', onPain: (f, u) => f.gain(u, 'armor', 1) },
    ability: { name: 'Martyrdom', desc: (u) => `Gain 50 Shield + 10 per Armor (${Math.round(50 + 10 * (u?.armor ?? 0))}).`,
      cast: (f, u, p) => { const s = (50 + 10 * u.armor) * p; f.gain(u, 'shield', s); if (u.sig === 'martyr_penance') hit(f, u, s * 0.4); } },
    signatures: [
      { id: 'martyr_penance', name: 'Penance', desc: 'Martyrdom also deals 40% of the Shield it grants as damage.' },
      { id: 'martyr_unbowed', name: 'Unbowed', desc: 'Start each fight with 6 Armor.', onStart: (f, u) => f.gain(u, 'armor', 6) },
    ],
  },
  {
    id: 'stormseer', name: 'Orrin', epithet: 'Speaker of Squalls', trigger: 'spell', resources: ['arcane', 'lightning'],
    body: 'slight',
    stats: { hp: 1310, ad: 24, manaMax: 100, ap: 0.88 },
    innate: { desc: 'On cast, gain 2 Arcane and 3 Lightning.', onCast: (f, u) => { f.gain(u, 'arcane', 2); f.gain(u, 'lightning', 3); } },
    ability: { name: 'Thunderclap', desc: (u) => `Deal 50 + 6 per bolt called this fight (${Math.round(50 + 6 * (u?.bolts ?? 0))}).`,
      cast: (f, u, p) => { hit(f, u, (50 + 6 * u.bolts) * p); } },
    signatures: [
      { id: 'storm_front', name: 'Storm Front', desc: 'Bolts need 7 Lightning instead of 10.', setup: (u) => { u.boltAt = Math.min(u.boltAt, 7); } },
      { id: 'storm_conduit', name: 'Conduit', desc: '+5 mana per attack.', setup: (u) => { u.manaPerAttack += 5; } },
    ],
  },
  {
    id: 'grove', name: 'Bram', epithet: 'Rooted', trigger: 'pain', resources: ['regen'],
    body: 'brawny',
    stats: { hp: 2200, ad: 24, as: 0.9, ap: 0.88 },
    innate: { desc: 'Start each fight with 1 Regen.', onStart: (f, u) => f.gain(u, 'regen', 1) },
    ability: { name: 'Overgrowth', desc: () => 'Heal 1.5% of max HP plus 0.3% per Regen.',
      cast: (f, u, p) => {
        const h = u.baseHp * (0.015 + 0.003 * u.regen) * Math.min(p, 1.5);
        const healed = f.heal(u, h, 'Overgrowth');
        if (u.sig === 'grove_thorn') hit(f, u, healed * 0.6);
      } },
    signatures: [
      { id: 'grove_thorn', name: 'Thornroot', desc: 'Overgrowth deals 60% of what it heals as damage.' },
      { id: 'grove_deep', name: 'Deep Roots', desc: '+150 max HP.', setup: (u) => { u.maxHp += 150; } },
    ],
  },
  {
    id: 'ashen', name: 'Morwen', epithet: 'Mother of Smoke', trigger: 'spell', resources: ['fire', 'poison'],
    body: 'slight',
    stats: { hp: 1530, ad: 25, manaMax: 90, ap: 0.98 },
    innate: { desc: 'On cast, gain 5 Fire.', onCast: (f, u) => f.gain(u, 'fire', 5) },
    ability: { name: 'Cinderplague', desc: (u) => `Deal 40 + 1 per Toxin on the enemy (${Math.round(40 + (u?.enemy?.poison ?? 0))}) and apply 12 Toxin plus 1 per 2 Fire.`,
      cast: (f, u, p) => { hit(f, u, (40 + u.enemy.poison) * p); f.apply(u, 'poison', Math.round((12 + u.fire / 2) * p)); } },
    signatures: [
      { id: 'ashen_kindled', name: 'Kindled Plague', desc: 'Your Toxin deals +30% damage.', setup: (u) => { u.m.poisonDmg += 0.3; } },
      { id: 'ashen_pyre', name: 'Pyre', desc: 'Cinderplague costs 25% less mana.', setup: (u) => { u.m.castCost *= 0.75; } },
    ],
  },
  {
    id: 'reaver', name: 'Kael', epithet: 'the Red Harvest', trigger: 'strike', resources: ['bleed', 'regen'],
    body: 'medium',
    stats: { hp: 1830, ad: 31, ap: 0.96 },
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
    id: 'sage', name: 'Wardweaver', epithet: 'Keeper of Wards', trigger: 'spell', resources: ['shield', 'arcane'],
    body: 'medium',
    stats: { hp: 1790, ad: 24, manaMax: 85, ap: 0.89 },
    innate: { desc: 'All Shield you gain is increased by 15%.', setup: (u) => { u.m.shieldGain += 0.15; } },
    ability: { name: 'Arcane Barrier', desc: () => 'Gain 45 Shield, then deal 30 plus 30% of your Shield as damage.',
      cast: (f, u, p) => { f.gain(u, 'shield', 45 * p * (u.sig === 'sage_overflow' ? 1.5 : 1)); hit(f, u, 30 * p + u.shield * 0.3 * Math.min(p, 1.6)); } },
    signatures: [
      { id: 'sage_rune', name: 'Runeward', desc: 'Start each fight with 50 Shield.', onStart: (f, u) => f.gain(u, 'shield', 50) },
      { id: 'sage_overflow', name: 'Overflow', desc: 'Arcane Barrier grants 50% more Shield.' },
    ],
  },
  {
    id: 'duelist', name: 'Forgeblade', epithet: 'First Blade of the Pit', trigger: 'precision', resources: ['fire', 'armor'],
    body: 'medium',
    stats: { hp: 1930, ad: 33, crit: 0.14, ap: 1.03 },
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
    body: 'slight',
    stats: { hp: 1700, ad: 25, as: 1.1, focusGain: 0.075, ap: 1.5 },
    innate: { desc: 'Gains 7.5% Focus each time she is hit. Dodges apply 4 Toxin.', onEvade: (f, u) => f.apply(u, 'poison', 4) },
    ability: { name: 'Smoke Veil', desc: (u) => `Gain 25% Focus and 30 Shield + 1 per Toxin on the enemy (${Math.round(30 + (u?.enemy?.poison ?? 0))}), and apply 6 Toxin plus 1 per 5 already on them.`,
      cast: (f, u, p) => { f.gain(u, 'focus', 0.25); f.gain(u, 'shield', (30 + u.enemy.poison) * p); f.apply(u, 'poison', Math.round((6 + u.enemy.poison / 5) * p)); } },
    signatures: [
      { id: 'shade_needles', name: 'Needle Rain', desc: 'Dodges apply 4 more Toxin.', onEvade: (f, u) => f.apply(u, 'poison', 4) },
      { id: 'shade_veil', name: 'Thick Smoke', desc: 'Start each fight with 30% Focus.', setup: (u) => { u.focusStart += 0.3; } },
    ],
  },
  {
    id: 'chainbreaker', name: 'Brakka', epithet: 'the Living Conduit', trigger: 'strike', resources: ['lightning'],
    body: 'brawny',
    stats: { hp: 2270, ad: 28, as: 1.05, ap: 0.86 },
    innate: { desc: 'On attack, gain 3 Lightning.', onAttack: (f, u) => f.gain(u, 'lightning', u.sig === 'chain_voltage' ? 4 : 3) },
    ability: { name: 'Thunderfall', desc: (u) => `Deal 45 + ${u?.sig === 'chain_aftershock' ? 22 : 14} per bolt called this fight (${Math.round(45 + (u?.sig === 'chain_aftershock' ? 22 : 14) * (u?.bolts ?? 0))}).`,
      cast: (f, u, p) => { hit(f, u, (45 + (u.sig === 'chain_aftershock' ? 22 : 14) * u.bolts) * p); } },
    signatures: [
      { id: 'chain_voltage', name: 'High Voltage', desc: 'Attacks grant 4 Lightning instead of 3.' },
      { id: 'chain_aftershock', name: 'Aftershock', desc: 'Thunderfall deals 22 per bolt called instead of 14.' },
    ],
  },
  {
    id: 'oathcleaver', name: 'Aldric', epithet: 'the Rusted Judge', trigger: 'strike', resources: ['bleed', 'armor'],
    body: 'brawny',
    stats: { hp: 2370, ad: 29, ap: 0.9 },
    innate: { desc: 'On attack, apply 1 Bleed. Every 3rd attack, gain 1 Armor.',
      onAttack: (f, u) => {
        f.apply(u, 'bleed', u.sig === 'oath_jagged' ? 2 : 1);
        u.oathHits = (u.oathHits || 0) + 1;
        if (u.oathHits % 3 === 0) f.gain(u, 'armor', u.sig === 'oath_iron' ? 2 : 1);
      } },
    ability: { name: 'Rusted Verdict', desc: (u) => `Deal 40 + 4 per Bleed on the enemy + 3 per Armor (${Math.round(40 + 4 * (u?.enemy?.bleed ?? 0) + 3 * (u?.armor ?? 0))}).`,
      cast: (f, u, p) => { hit(f, u, (40 + 4 * u.enemy.bleed + 3 * u.armor) * p); } },
    signatures: [
      { id: 'oath_jagged', name: 'Jagged Edge', desc: 'Attacks apply 2 Bleed instead of 1.' },
      { id: 'oath_iron', name: 'Iron Habit', desc: 'Every 3rd attack grants 2 Armor instead of 1.' },
    ],
  },
  {
    id: 'snowthorn', name: 'Sigrun', epithet: 'the Last Huntress', trigger: 'precision', resources: ['frost'],
    body: 'slight',
    stats: { hp: 1700, ad: 30, crit: 0.2, ap: 1.5 },
    innate: { desc: 'On crit, apply 7 Frost.', onCrit: (f, u) => f.apply(u, 'frost', u.sig === 'snow_pierce' ? 9 : 7) },
    ability: { name: "Winter's Kiss", desc: (u) => `Deal 70 + 6 per Frost on the enemy + 40 per freeze this fight (${Math.round(70 + 6 * (u?.enemy?.frost ?? 0) + 40 * (u?.freezesDone ?? 0))}).`,
      cast: (f, u, p) => {
        const exec = u.sig === 'snow_exec' && u.enemy.frozen > 0 ? 40 : 0;
        hit(f, u, (70 + 6 * u.enemy.frost + 40 * u.freezesDone + exec) * p);
      } },
    signatures: [
      { id: 'snow_pierce', name: 'Piercing Cold', desc: 'Crits apply 9 Frost instead of 7.' },
      { id: 'snow_exec', name: 'Cold Execution', desc: "Winter's Kiss deals 40 more damage to frozen enemies." },
    ],
  },
  {
    id: 'runevolt', name: 'Rook', epithet: 'the Thunderbrand', trigger: 'precision', resources: ['arcane', 'lightning'],
    body: 'medium',
    stats: { hp: 1750, ad: 28, crit: 0.15, ap: 0.5 },
    innate: { desc: 'On crit, gain 2 Arcane and 3 Lightning.', onCrit: (f, u) => { f.gain(u, 'arcane', 2); f.gain(u, 'lightning', u.sig === 'rune_charged' ? 5 : 3); } },
    ability: { name: 'Runic Discharge', desc: (u) => `Deal 40 + 2 per Arcane + ${u?.sig === 'rune_storm' ? 14 : 8} per bolt called this fight (${Math.round(40 + 2 * (u?.arcane ?? 0) + (u?.sig === 'rune_storm' ? 14 : 8) * (u?.bolts ?? 0))}).`,
      cast: (f, u, p) => { hit(f, u, (40 + 2 * u.arcane + (u.sig === 'rune_storm' ? 14 : 8) * u.bolts) * p); } },
    signatures: [
      { id: 'rune_charged', name: 'Charged Runes', desc: 'Crits grant 5 Lightning instead of 3.' },
      { id: 'rune_storm', name: 'Storm Inscription', desc: 'Runic Discharge deals 14 per bolt called instead of 8.' },
    ],
  },
  {
    id: 'dawnfeather', name: 'Pyrelle', epithet: 'the Reborn Flame', trigger: 'evasion', resources: ['fire', 'regen'],
    body: 'slight',
    stats: { hp: 1640, ad: 27, as: 1.1, focusGain: 0.07, ap: 1.16 },
    innate: { desc: 'Gains 7% Focus each time she is hit. Dodges grant 4 Fire and 1 Regen.',
      onEvade: (f, u) => { f.gain(u, 'fire', u.sig === 'dawn_wings' ? 6 : 4); f.gain(u, 'regen', u.sig === 'dawn_spring' ? 2 : 1); } },
    ability: { name: 'Phoenix Waltz', desc: (u) => `Deal 40 + 3 per Fire (${Math.round(40 + 3 * (u?.fire ?? 0))}) and heal 0.5% of max HP per Regen (${((u?.regen ?? 0) * 0.5).toFixed(1)}%).`,
      cast: (f, u, p) => { hit(f, u, (40 + 3 * u.fire) * p); f.heal(u, u.baseHp * 0.005 * u.regen * Math.min(p, 1.5), 'Phoenix Waltz'); } },
    signatures: [
      { id: 'dawn_wings', name: 'Blazing Wings', desc: 'Dodges grant 6 Fire instead of 4.' },
      { id: 'dawn_spring', name: 'Second Spring', desc: 'Dodges grant 2 Regen instead of 1.' },
    ],
  },
  {
    id: 'gravespike', name: 'Mordrek', epithet: 'the Unyielding', trigger: 'pain', resources: ['bleed', 'armor'],
    body: 'brawny',
    stats: { hp: 2210, ad: 27, as: 0.7, ap: 0.55 },
    innate: { desc: 'When hurt: gain 1 Armor.',
      onPain: (f, u) => { f.gain(u, 'armor', u.sig === 'grave_bones' ? 2 : 1); } },
    ability: { name: 'Grave Sentence', desc: (u) => `Deal 40 + 1 per Bleed on the enemy and Armor (${Math.round(40 + (u?.enemy?.bleed ?? 0) + (u?.armor ?? 0))}), then apply ${u?.sig === 'grave_debt' ? 8 : 4} Bleed.`,
      cast: (f, u, p) => { hit(f, u, (40 + u.enemy.bleed + u.armor) * p); f.apply(u, 'bleed', Math.round((u.sig === 'grave_debt' ? 8 : 4) * Math.min(p, 1.6))); } },
    signatures: [
      { id: 'grave_debt', name: 'Blood Debt', desc: 'Grave Sentence applies 8 Bleed instead of 4.' },
      { id: 'grave_bones', name: 'Unbroken Bones', desc: 'Being hurt grants 2 Armor instead of 1.' },
    ],
  },
];

export const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

// Visibility after bans. Returns 'hidden' or 'ok'.
export function characterStatus(char, bans) {
  return char.resources.some((r) => bans.includes(r)) ? 'hidden' : 'ok';
}
