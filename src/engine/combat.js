import { makeRng } from '../rng.js';
import { CARD_BY_ID } from '../data/cards.js';
import { CHAR_BY_ID } from '../data/characters.js';

export const DT = 0.05;
// Overtime, so every fight ends with a death (TFT-style):
//   from 30s  all damage +8% per second, healing and shield gains -3% per
//             second (gone entirely at about 63s)
//   from 60s  the arena burns both fighters for unblockable damage that grows
//             every second
export const SUDDEN_DEATH_AT = 30;
export const BURN_AT = 60;
export const TIME_LIMIT = 180; // safety net only; the burn ends fights long before
export function overtime(t) {
  const over = Math.max(0, t - SUDDEN_DEATH_AT);
  return { damage: 1 + over * 0.08, healing: Math.max(0, 1 - over * 0.03), burn: Math.max(0, t - BURN_AT) * 0.005 };
}
// Fighters get tougher every round so late-game damage doesn't end fights in
// a hit or two. Fitted so fights last about as long in round 14 as in round 1.
export function hpScale(round = 1) {
  return 1 + 0.015 * (Math.max(1, round) - 1) ** 2;
}
const DEFAULT_SOURCE = { attack: 'Attacks', poison: 'Toxin', bleed: 'Bleed', thorns: 'Thorns', true: 'Other' };

const HOOKS = ['onStart', 'onAttack', 'onHit', 'onCrit', 'onEvade', 'onPain', 'onHeal', 'onCast', 'onFreeze', 'onBolt', 'onHitTaken', 'onShieldBreak', 'bonusDamage'];
// Healing this share of base max HP counts as one "On heal".
export const HEAL_STEP = 0.05;
// Max HP each Health (pain) card gives.
export const HEALTH_PER_CARD = 5;
// Each freeze you suffer needs this much more Frost than the last one.
export const FREEZE_STEP = 10;
// Grit: losing GRIT_AT of max HP within GRIT_WINDOW seconds halves the damage
// you take for GRIT_DUR seconds, at most once every GRIT_CD seconds.
export const GRIT = { at: 0.3, window: 2, dur: 1.5, cut: 0.5, cd: 6 };
// Lightning: this many stacks call a bolt. Each bolt deals BOLT.base plus
// BOLT.step for every bolt already called this fight (up to BOLT.maxSteps),
// and stutters the enemy's swing: it is pushed back by BOLT.stutter of a
// swing. However many bolts land, one swing is never pushed back by more than
// BOLT.maxDelay of a swing in total.
export const BOLT_AT = 10;
export const BOLT = { base: 40, step: 5, maxSteps: 20, stutter: 0.25, maxDelay: 0.5 };
// Fire: +FIRE.as attack speed per stack. Reaching your Fire cap sets off
// Afterburner: all your Fire burns out and for FIRE.rushDur seconds (longer
// if you burned more than FIRE.cap) you attack FIRE.rush faster and each hit
// scorches for FIRE.scorch of its damage again.
export const FIRE = { cap: 40, as: 0.01, rush: 1, rushDur: 3, scorch: 0.3 };
// Arcane gives ability power for at most this many stacks.
export const ARCANE_CAP = 25;
// Attack damage each Strike card gives.
export const STRIKE_AD = 0.03;
// Toxin, Bleed and Regen lose DOT_DECAY of their stacks every DOT_EVERY seconds.
export const DOT_DECAY = 1 / 3;
export const DOT_EVERY = 2;
// Bleed ticks lightly (BLEED.tick of the target's base max HP per stack per
// second). Reaching BLEED.at stacks (the source's bleedAt) bleeds them out: every stack is used up
// for BLEED.burst of the target's missing HP.
export const BLEED = { tick: 0.0015, at: 30, burst: 0.3 };
// Each Regen stack heals this share of base max HP per second.
export const REGEN_RATE = 0.003;
const BASE = { hp: 1800, ad: 30, as: 1.0, crit: 0.05, critMult: 1.75, manaMax: 100, manaPerAttack: 10, focusGain: 0 };

// Build a combat unit from a loadout: { charId, cards: {id: copies}, sig, round }.
export function buildUnit(loadout, side) {
  const ch = CHAR_BY_ID[loadout.charId];
  const s = { ...BASE, ...ch.stats };
  const u = {
    side, char: ch, sig: loadout.sig || null,
    maxHp: s.hp, hp: 0, ad: s.ad, asBase: s.as, asBonus: 0, crit: s.crit, critMult: s.critMult,
    manaMax: s.manaMax, mana: 0, manaStart: 0, manaPerAttack: s.manaPerAttack, manaRegen: 0,
    // stacks on self
    fire: 0, fireCap: FIRE.cap, fireStart: 0, fireIdle: 0, fireLinger: 3, rush: 0, afterburners: 0,
    shield: 0, regen: 0, arcane: 0, arcaneValue: 0.04, armor: 0,
    lightning: 0, boltAt: BOLT_AT, bleedAt: BLEED.at, bolts: 0, galv: 0,
    // stacks the enemy put on you
    frost: 0, poison: 0, bleed: 0,
    // freeze settings you impose on the enemy
    freezeAt: 16, freezeDur: 1.5, freezesDone: 0, freezeImmune: 0, freezesTaken: 0,
    // grit
    recent: [], grit: 0, gritCd: 0, gritAt: GRIT.at, gritCut: GRIT.cut,
    // evasion
    focus: 0, focusGain: s.focusGain, focusCap: 0.6, focusReset: 0, focusStart: 0,
    // pain
    painStep: 0.12, painAcc: 0, healAcc: 0,
    // timers and counters
    frozen: 0, immune: 0, bastionCd: 0, attackTimer: 0, swingDelay: 0, dotTimer: 0, attackCount: 0, castCount: 0, forceCrit: 0,
    momentumCap: 0, pendingAttacks: [], bleedApplied: 0, swingStutter: 0,
    m: {
      poisonDmg: 1, bleedDmg: 1, bleedDecay: 1, frostDecay: 1, shieldGain: 1, shieldCap: 1, vsShield: 1,
      poisonTaken: 1, frostTaken: 1, bleedTaken: 1, abilityTaken: 1, enemyHealCut: 0,
      abilityPower: s.ap ?? 1, castCost: 1, frozenBonus: 0, reflect: 0, manaWard: 0, armorPierce: 0,
      focusDrain: 0, trueSight: 0, critMissing: 0, castRefund: 0, berserk: 0, bleedLeech: 0,
      pandemic: 0, secondWind: 0, healGain: 1, boltDmg: 1, boltTaken: 1, afterburnTaken: 1,
    },
    flags: {},
    used: {},
    hooks: Object.fromEntries(HOOKS.map((h) => [h, []])),
    timers: [],
    stats: { dealt: 0, taken: 0, healed: 0, dodges: 0, crits: 0, casts: 0, freezes: 0, bolts: 0, afterburners: 0, byKind: {}, dmg: {}, heal: {}, mit: {} },
    tagCounts: {},
  };

  const sources = [];
  sources.push({ src: ch.innate, n: 1, name: 'innate' });
  for (const [id, n] of Object.entries(loadout.cards || {})) {
    const card = CARD_BY_ID[id];
    if (card && n > 0) {
      sources.push({ src: card, n, name: card.name });
      for (const t of card.tags) u.tagCounts[t] = (u.tagCounts[t] || 0) + n;
    }
  }
  if (u.sig) {
    const sig = ch.signatures.find((x) => x.id === u.sig);
    if (sig) sources.push({ src: sig, n: 1, name: sig.name });
  }

  // Trigger tag passives: owning cards of a trigger makes that trigger happen.
  const tc = u.tagCounts;
  u.crit += 0.01 * (tc.precision || 0);
  u.focusGain += 0.05 * (tc.evasion || 0);
  u.painStep -= 0.005 * (tc.pain || 0);
  u.maxHp += HEALTH_PER_CARD * (tc.pain || 0);
  u.manaPerAttack += 0.5 * (tc.spell || 0);

  for (const { src, n } of sources) {
    if (src.setup) src.setup(u, n);
    for (const h of HOOKS) if (src[h]) u.hooks[h].push({ fn: src[h], n });
    if (src.every) u.timers.push({ interval: src.every[0], fn: src.every[1], n, acc: 0 });
  }

  if (u.flags.titan) { u.maxHp *= 1.6; u.asBase *= 0.8; u.hooks.bonusDamage.push({ fn: (f, x) => x.baseHp * 0.02, n: 1 }); }
  if (u.flags.bullseye) u.crit *= 2;
  u.ad *= 1 + STRIKE_AD * (tc.strike || 0);
  if (u.flags.tempest) u.boltAt = Math.max(3, Math.round(u.boltAt * 2 / 3));
  u.crit = Math.min(u.crit, 0.95);
  // Effects worth "x% of max HP" (bleed, regen, shields...) use baseHp, the
  // HP before round scaling, so they don't grow faster than everything else.
  u.baseHp = u.maxHp;
  u.maxHp = Math.round(u.maxHp * hpScale(loadout.round));
  u.hp = u.maxHp;
  return u;
}

// Attacks per second right now (the renderer's swing timer uses it too).
export function attackSpeedOf(u) {
  let as = u.asBase * (1 + u.asBonus + u.galv + FIRE.as * u.fire + (u.rush > 0 ? FIRE.rush : 0) + Math.min(u.momentumCap, 0.01 * u.attackCount));
  if (u.m.berserk) as *= 1 + u.m.berserk * (1 - u.hp / u.maxHp);
  return as * slowOf(u);
}

function slowOf(u) {
  return Math.max(0.3, 1 - 0.015 * u.frost);
}

export class Fight {
  constructor(loadoutA, loadoutB, seed = 1) {
    this.rng = makeRng(seed);
    this.a = buildUnit(loadoutA, 0);
    this.b = buildUnit(loadoutB, 1);
    this.a.enemy = this.b;
    this.b.enemy = this.a;
    this.units = [this.a, this.b];
    this.t = 0;
    this.over = false;
    this.winner = null; // 0, 1, or -1 for a draw
    this.onEvent = null; // set by the renderer to receive hit/dodge/cast events
    for (const u of this.units) {
      u.mana = Math.min(u.manaMax * 0.9, u.manaStart);
      u.focus = Math.min(u.focusCap, u.focusStart);
      if (u.fireStart) this.gain(u, 'fire', u.fireStart);
    }
    for (const u of this.units) this.run(u, 'onStart');
  }

  emit(type, u, data = {}) {
    if (this.onEvent) this.onEvent({ t: this.t, type, side: u.side, ...data });
  }

  run(u, hook, arg) {
    for (const h of u.hooks[hook]) h.fn(this, u, h.n, arg);
  }

  // Stacks on yourself.
  gain(u, res, k) {
    if (u.dead || !(k > 0)) return;
    switch (res) {
      // Fire melts the Frost on you, stack for stack. Hitting the cap sets
      // off Afterburner.
      case 'fire':
        u.fire = Math.min(u.fireCap, u.fire + k); u.fireIdle = 0; u.frost = Math.max(0, u.frost - k);
        if (u.fire >= u.fireCap) this.afterburner(u);
        break;
      case 'shield': u.shield = Math.min(u.maxHp * u.m.shieldCap, u.shield + k * u.m.shieldGain * overtime(this.t).healing); break;
      case 'regen': u.regen += k; break;
      case 'arcane': u.arcane += k; break;
      case 'armor': u.armor += k; break;
      case 'focus': u.focus = Math.min(u.focusCap, u.focus + k); break;
      case 'lightning':
        u.lightning += k;
        while (u.lightning >= u.boltAt && !u.dead && !u.enemy.dead) { u.lightning -= u.boltAt; this.bolt(u); }
        break;
    }
  }

  // Stacks you put on the enemy.
  apply(src, res, k) {
    const tgt = src.enemy;
    if (tgt.dead || !(k > 0)) return;
    if (res === 'frost') {
      // No Frost builds up while already frozen.
      if (tgt.frozen > 0) return;
      tgt.frost += k * Math.max(0, tgt.m.frostTaken);
      if (tgt.frost >= this.freezePoint(src, tgt)) this.freeze(src, tgt);
    } else if (res === 'poison') {
      tgt.poison += k;
      if (src.m.pandemic && tgt.poison >= 40) {
        this.damage(src, tgt, tgt.poison * src.m.pandemic, 'poison', { source: 'Pandemic' });
        tgt.poison = Math.floor(tgt.poison / 2);
        this.emit('burst', tgt);
      }
    } else if (res === 'bleed') {
      tgt.bleed += k;
      if (tgt.bleed >= src.bleedAt) this.bleedOut(src, tgt);
      if (src.flags.septic) this.apply(src, 'poison', k / 2);
      if (src.flags.bloodRite) {
        src.bleedApplied += k;
        while (src.bleedApplied >= 6) { src.bleedApplied -= 6; this.gain(src, 'regen', 1); }
      }
    }
  }

  // Bleed out: the stacks are used up in one burst that hits harder the more
  // HP the target is already missing.
  bleedOut(src, tgt) {
    tgt.bleed = 0;
    src.stats.bleedOuts = (src.stats.bleedOuts || 0) + 1;
    this.emit('bleedout', tgt);
    return this.damage(src, tgt, (tgt.maxHp - tgt.hp) * BLEED.burst * src.m.bleedDmg, 'bleed', { source: 'Bleed out' });
  }

  // Frost needed to freeze tgt: rises by FREEZE_STEP with every freeze it suffered.
  freezePoint(src, tgt) {
    return Math.max(6, src.freezeAt) + FREEZE_STEP * tgt.freezesTaken;
  }

  freeze(src, tgt) {
    tgt.frost = 0;
    if (tgt.freezeImmune > 0) { tgt.freezeImmune--; this.emit('resist', tgt); return; }
    tgt.freezesTaken++;
    src.freezesDone++;
    src.flags.bigFreeze = src.flags.absoluteZero && src.freezesDone % 3 === 0;
    tgt.frozen = src.flags.bigFreeze ? 4 : src.freezeDur;
    src.stats.freezes++;
    this.emit('freeze', tgt, { dur: tgt.frozen });
    this.run(src, 'onFreeze');
    src.flags.bigFreeze = false;
  }

  // A Lightning bolt: ability damage that grows with every bolt this fight
  // and stutters the enemy's swing, pushing their next attack back.
  bolt(u) {
    const e = u.enemy;
    const d = this.boltDamage(u) * Math.max(0, e.m.boltTaken);
    u.bolts++;
    u.stats.bolts++;
    this.emit('bolt', e);
    this.damage(u, e, d, 'ability', { source: 'Lightning' });
    this.stutter(e, BOLT.stutter);
    this.run(u, 'onBolt');
  }

  boltDamage(u) {
    const frozen = u.flags.superconductor && u.enemy.frozen > 0 ? 1.5 : 1;
    return (BOLT.base + BOLT.step * Math.min(BOLT.maxSteps, u.bolts)) * u.m.boltDmg * frozen;
  }

  // Push u's next attack back by `frac` of a swing, at most BOLT.maxDelay of
  // a swing per swing however many bolts land at once. swingDelay keeps the
  // seconds added to the current swing for the swing timer.
  stutter(u, frac) {
    const lost = Math.min(frac, BOLT.maxDelay - u.swingStutter);
    if (lost > 0) {
      u.swingStutter += lost;
      u.attackTimer -= lost;
      u.swingDelay += lost / Math.max(0.05, this.attackSpeed(u));
      this.emit('stutter', u, { delay: u.swingDelay });
    }
  }

  // Afterburner: your Fire hit its cap. It all burns out at once and you
  // go into a frenzy of much faster, scorching attacks.
  afterburner(u) {
    if (u.dead) return;
    const burned = u.fire;
    u.fire = 0;
    u.afterburners++;
    u.stats.afterburners++;
    u.rush = FIRE.rushDur * Math.max(1, burned / FIRE.cap) * Math.max(0, u.enemy.m.afterburnTaken);
    this.emit('afterburner', u, { burned });
  }

  antiheal(u) {
    return Math.min(0.9, u.enemy.m.enemyHealCut);
  }

  // Per-source tallies for the stats panel. `mit` is damage prevented.
  tally(u, table, source, amt) {
    if (amt > 0) u.stats[table][source] = (u.stats[table][source] || 0) + amt;
  }

  heal(u, amt, source = 'Other') {
    if (u.dead || amt <= 0) return 0;
    amt *= u.m.healGain * Math.max(0, 1 - this.antiheal(u)) * overtime(this.t).healing;
    const room = u.maxHp - u.hp;
    const healed = Math.min(room, amt);
    u.hp += healed;
    if (u.flags.overhealShield && amt > healed) this.gain(u, 'shield', amt - healed);
    u.stats.healed += healed;
    this.tally(u, 'heal', source, healed);
    u.healAcc += healed;
    let guard = 0;
    while (u.healAcc >= HEAL_STEP * u.baseHp && guard++ < 10 && !u.dead) {
      u.healAcc -= HEAL_STEP * u.baseHp;
      this.run(u, 'onHeal');
    }
    return healed;
  }

  // kind: attack | ability | poison | bleed | thorns | true
  // info.source names the damage in the stats panel (defaults by kind).
  damage(src, tgt, amt, kind, info = {}) {
    if (tgt.dead || !(amt > 0)) return 0;
    const source = info.source || DEFAULT_SOURCE[kind] || src.char.ability.name;
    amt *= overtime(this.t).damage;
    if (tgt.immune > 0) { this.tally(tgt, 'mit', 'Immunity', amt); return 0; }
    if (tgt.frozen > 0 && src.m.frozenBonus && (kind === 'attack' || kind === 'ability')) amt *= 1 + src.m.frozenBonus;
    let before = amt;
    if (kind === 'attack' || kind === 'thorns') {
      const armor = 1.25 * Math.max(0, tgt.armor + (tgt.flags.moltenArmor ? Math.floor(tgt.fire / 5) : 0) - src.m.armorPierce);
      amt = Math.max(amt * 0.25, amt - armor);
      this.tally(tgt, 'mit', 'Armor', before - amt);
    }
    before = amt;
    if (kind === 'ability') amt *= Math.max(0, tgt.m.abilityTaken);
    if (kind === 'poison') amt *= Math.max(0, tgt.m.poisonTaken);
    if (kind === 'bleed') amt *= Math.max(0, tgt.m.bleedTaken);
    this.tally(tgt, 'mit', 'Resistances', before - amt);
    if (tgt.flags.livingMountain && (kind === 'attack' || kind === 'ability')) {
      before = amt;
      amt = Math.min(amt, tgt.maxHp * 0.06);
      this.tally(tgt, 'mit', 'Living Mountain', before - amt);
    }

    // Toxin goes through Armor (above) but not Shield.
    if (kind !== 'true' && tgt.shield > 0) {
      const eff = amt * src.m.vsShield;
      const absorbed = Math.min(tgt.shield, eff);
      tgt.shield -= absorbed;
      amt = (eff - absorbed) / src.m.vsShield;
      this.tally(tgt, 'mit', 'Shield', absorbed / src.m.vsShield);
      if (tgt.m.reflect && kind === 'attack') this.damage(tgt, src, absorbed * tgt.m.reflect, 'true', { source: 'Reflective Plating' });
      if (tgt.shield <= 0.01) {
        tgt.shield = 0;
        this.run(tgt, 'onShieldBreak');
        if (tgt.flags.bastion && tgt.bastionCd <= 0) {
          tgt.immune = 1; tgt.bastionCd = 6; this.emit('immune', tgt);
          return absorbed;
        }
      }
    }
    if (tgt.m.manaWard && kind === 'attack' && tgt.arcane >= 5) {
      this.tally(tgt, 'mit', 'Mana Shield', amt * tgt.m.manaWard);
      amt *= 1 - tgt.m.manaWard;
    }
    if (tgt.grit > 0 && source !== 'Arena burn') {
      this.tally(tgt, 'mit', 'Grit', amt * tgt.gritCut);
      amt *= 1 - tgt.gritCut;
    }
    if (amt <= 0) return 0;

    tgt.hp -= amt;
    if (source !== 'Arena burn') this.checkGrit(tgt, amt);
    src.stats.dealt += amt;
    this.tally(src, 'dmg', source, amt);
    src.stats.byKind[kind] = (src.stats.byKind[kind] || 0) + amt;
    tgt.stats.taken += amt;
    if (kind === 'attack' || kind === 'ability' || kind === 'thorns') this.emit('dmg', tgt, { amt, kind, crit: !!info.crit, source: info.source });

    // Pain triggers
    tgt.painAcc += amt;
    const step = Math.max(0.04, tgt.painStep) * tgt.maxHp;
    let guard = 0;
    while (tgt.painAcc >= step && guard++ < 10 && tgt.hp > 0) {
      tgt.painAcc -= step;
      this.run(tgt, 'onPain');
    }
    if (tgt.m.secondWind && !tgt.used.secondWind && tgt.hp < tgt.maxHp * 0.5) {
      tgt.used.secondWind = true;
      this.gain(tgt, 'regen', tgt.m.secondWind);
    }
    if (tgt.flags.lastStand && !tgt.used.lastStand && tgt.hp > 0 && tgt.hp < tgt.maxHp * 0.3) {
      tgt.used.lastStand = true;
      for (let i = 0; i < 3; i++) this.run(tgt, 'onPain');
      tgt.immune = 1;
      this.emit('immune', tgt);
    }
    if (tgt.hp <= 0) {
      if (tgt.flags.phoenix && !tgt.used.phoenix) {
        tgt.used.phoenix = true;
        tgt.hp = tgt.maxHp * Math.max(0.1, Math.min(1, tgt.fire * 0.02));
        this.tally(tgt, 'heal', 'Phoenix Core', tgt.hp);
        tgt.fire = 0;
        tgt.poison = Math.floor(tgt.poison / 2);
        tgt.bleed = 0;
        tgt.immune = 0.5;
        this.emit('revive', tgt);
      } else {
        tgt.hp = 0;
        tgt.dead = true;
      }
    }
    return amt;
  }

  // Grit: a burst of damage in a short window makes you tougher for a moment.
  checkGrit(u, amt) {
    u.recent.push([this.t, amt]);
    while (u.recent.length && u.recent[0][0] < this.t - GRIT.window) u.recent.shift();
    if (u.grit > 0 || u.gritCd > 0 || u.hp <= 0) return;
    let sum = 0;
    for (const [, a] of u.recent) sum += a;
    if (sum >= u.gritAt * u.maxHp) {
      u.grit = GRIT.dur; u.gritCd = GRIT.cd; u.recent = [];
      this.emit('grit', u);
    }
  }

  attackSpeed(u) {
    return attackSpeedOf(u);
  }

  slow(u) {
    return slowOf(u);
  }

  // An extra attack made right after this tick's swing. `source` names its
  // damage in the stats panel (plain attacks count as Attacks).
  queueExtraAttack(u, source) {
    u.pendingAttacks.push(source || null);
  }

  attack(a, extra = false, source = null) {
    const d = a.enemy;
    if (a.dead || d.dead) return;
    a.attackCount++;
    this.run(a, 'onAttack', { extra });
    if (a.flags.whirlwind) this.run(a, 'onAttack', { extra: true });
    if (d.dead) return;

    const canDodge = (d.focusGain > 0 || d.focus > 0) && !(a.m.trueSight && a.attackCount % a.m.trueSight === 0);
    if (canDodge && this.rng() < d.focus) {
      d.focus = d.focusReset;
      d.stats.dodges++;
      this.tally(d, 'mit', 'Dodge', a.ad);
      this.emit('dodge', d);
      this.run(d, 'onEvade');
      return;
    }
    if (d.focusGain > 0) d.focus = Math.min(d.focusCap, d.focus + d.focusGain);
    if (a.m.focusDrain) d.focus *= 1 - Math.min(1, a.m.focusDrain);

    let crit = false;
    if (a.forceCrit > 0) { crit = true; a.forceCrit--; } else crit = this.rng() < a.crit;
    let dmg = a.ad;
    for (const h of a.hooks.bonusDamage) dmg += h.fn(this, a, h.n) || 0;
    if (crit) {
      dmg *= a.critMult;
      if (a.m.critMissing) dmg += (d.maxHp - d.hp) * a.m.critMissing;
      a.stats.crits++;
    }
    const dealt = this.damage(a, d, dmg, 'attack', source ? { crit, source } : { crit });
    if (a.rush > 0 && !d.dead) this.damage(a, d, dealt * FIRE.scorch, 'ability', { source: 'Afterburner' });
    const hit = { crit, dmg: dealt };
    this.emit('attack', a, { crit });
    this.run(a, 'onHit', hit);
    if (crit) this.run(a, 'onCrit', hit);
    if (!d.dead) this.run(d, 'onHitTaken', a);
  }

  cast(u) {
    u.castCount++;
    u.stats.casts++;
    const power = u.m.abilityPower * (1 + Math.min(u.arcane, ARCANE_CAP) * u.arcaneValue + (u.flags.spellfire ? u.fire * 0.01 : 0));
    this.emit('cast', u, { name: u.char.ability.name });
    u.char.ability.cast(this, u, power);
    if (u.flags.spellEcho && u.castCount % 3 === 0) u.char.ability.cast(this, u, power * 0.5);
    this.run(u, 'onCast');
    if (u.m.castRefund) u.mana += u.manaMax * u.m.castRefund;
  }

  step(dt = DT) {
    if (this.over) return;
    this.t += dt;
    for (const u of this.units) {
      if (u.dead) continue;
      const e = u.enemy;
      u.frozen = Math.max(0, u.frozen - dt);
      u.immune = Math.max(0, u.immune - dt);
      u.bastionCd = Math.max(0, u.bastionCd - dt);
      u.rush = Math.max(0, u.rush - dt);
      u.grit = Math.max(0, u.grit - dt);
      u.gritCd = Math.max(0, u.gritCd - dt);

      // Damage over time the enemy put on this unit.
      if (u.poison > 0) {
        let mult = e.m.poisonDmg * (e.flags.plague ? 1.5 : 1);
        if (e.flags.toxicFrost && (u.frost >= 5 || u.frozen > 0)) mult *= 1.6;
        const d = this.damage(e, u, u.poison * mult * dt, 'poison');
        if (e.flags.plague) this.heal(e, d * 0.2, 'Plague Lord');
      }
      if (u.bleed > 0.05 && !u.dead) {
        const d = this.damage(e, u, u.bleed * BLEED.tick * u.baseHp * e.m.bleedDmg * dt, 'bleed');
        if (e.m.bleedLeech) this.heal(e, d * e.m.bleedLeech, 'Bleed lifesteal');
      }
      if (u.regen > 0) this.heal(u, u.regen * REGEN_RATE * u.baseHp * dt, 'Regen');
      // Toxin, Bleed and Regen lose a third of their stacks every 2 seconds.
      u.dotTimer += dt;
      if (u.dotTimer >= DOT_EVERY - 1e-9) {
        u.dotTimer -= DOT_EVERY;
        u.poison *= 1 - DOT_DECAY;
        u.bleed *= 1 - DOT_DECAY * Math.max(0, e.m.bleedDecay);
        u.regen *= 1 - DOT_DECAY;
        if (u.poison < 1) u.poison = 0;
        if (u.bleed < 1) u.bleed = 0;
        if (u.regen < 1) u.regen = 0;
      }
      if (u.dead) continue;
      u.frost = Math.max(0, u.frost - 0.6 * e.m.frostDecay * dt);
      const burn = overtime(this.t).burn;
      if (burn > 0) this.damage(e, u, u.maxHp * burn * dt, 'true', { source: 'Arena burn' });
      if (u.dead) continue;
      u.fireIdle += dt;
      if (u.fireIdle > u.fireLinger) u.fire = Math.max(0, u.fire - 2.5 * dt);

      for (const tm of u.timers) {
        tm.acc += dt;
        if (tm.acc >= tm.interval) { tm.acc -= tm.interval; tm.fn(this, u, tm.n); }
      }

      if (u.frozen <= 0) {
        // Mana fills smoothly: mana per attack times attacks per second.
        const as = this.attackSpeed(u);
        u.mana += (u.manaRegen * this.slow(u) + u.manaPerAttack * as) * dt;
        u.attackTimer += as * dt;
        let guard = 0;
        while (u.attackTimer >= 1 && guard++ < 4 && !u.dead && !e.dead) {
          u.attackTimer -= 1;
          u.swingDelay = 0;
          u.swingStutter = 0;
          this.attack(u);
        }
        while (u.pendingAttacks.length && !u.dead && !e.dead) this.attack(u, true, u.pendingAttacks.shift());
        const cost = u.manaMax * u.m.castCost;
        if (u.mana >= cost && !u.dead && !e.dead) {
          u.mana -= cost;
          this.cast(u);
          while (u.pendingAttacks.length && !u.dead && !e.dead) this.attack(u, true, u.pendingAttacks.shift());
        }
      }
      u.mana = Math.min(u.mana, u.manaMax * 1.5);
    }
    this.checkEnd();
  }

  checkEnd() {
    const [a, b] = this.units;
    if (a.dead || b.dead) {
      this.over = true;
      this.winner = a.dead && b.dead ? -1 : a.dead ? 1 : 0;
    } else if (this.t >= TIME_LIMIT) {
      this.over = true;
      const pa = a.hp / a.maxHp, pb = b.hp / b.maxHp;
      this.winner = Math.abs(pa - pb) < 0.01 ? -1 : pa > pb ? 0 : 1;
    }
  }

  runToEnd() {
    while (!this.over) this.step();
    return this.result();
  }

  result() {
    const w = this.winner;
    const survivor = w >= 0 ? this.units[w] : null;
    return {
      winner: w,
      time: this.t,
      survivorHpPct: survivor ? survivor.hp / survivor.maxHp : 0,
      stats: this.units.map((u) => ({ ...u.stats })),
    };
  }
}
