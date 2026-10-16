import { CARD_BY_ID, cardResources } from '../data/cards.js';
import { CHAR_BY_ID } from '../data/characters.js';
import { RESOURCES, TRIGGERS, TIER_UNLOCK, HYBRID_REQ } from '../data/tags.js';
import { cardCost, tagCounts, REROLL_COST } from '../engine/shop.js';
import { buy, reroll, rngFor, visibleCharacters, submitBan, pickCharacter, chooseSignature, loadout } from '../engine/match.js';
import { Fight } from '../engine/combat.js';
import { CARD_VALUES } from './cardValues.js';

// The rival. Three levels:
//   easy    commits loosely to its gladiator's tags, buys on impulse
//   normal  plans a two-resource build, manages gold, chases tier unlocks and
//           hybrids, and buys counters to your main resource
//   hard    everything normal does, then test-fights its top candidate cards
//           against your current build before buying, and picks signatures
//           the same way
// The bot only sees what a human would see: your gladiator and your cards.

export const LEVELS = {
  easy:   { noise: 3, rerolls: 1, counters: false, economy: false, sims: 0, spendAll: 0 },
  normal: { noise: 0.6, rerolls: 4, counters: true, economy: true, sims: 0, spendAll: -1, valueWeight: 14, planWeight: 0.35 },
  hard:   { noise: 0.2, rerolls: 7, counters: true, economy: true, sims: 4, simTop: 3, simWeight: 6, spendAll: -1, valueWeight: 14, planWeight: 0.35 },
};
const level = (p) => LEVELS[p.level] || LEVELS.normal;

// Resources that tend to dominate bot-vs-bot play; smarter bots ban these.
const THREAT = { poison: 3, regen: 3, bleed: 2, shield: 2, armor: 1.5, fire: 1.5, frost: 1.2, arcane: 1 };

export function botBan(m, id) {
  const p = m.players[id];
  const rng = rngFor(m);
  if (p.level === 'easy') return submitBan(m, id, rng.pick(RESOURCES));
  let r = rng() * RESOURCES.reduce((s, x) => s + THREAT[x], 0);
  for (const x of RESOURCES) { r -= THREAT[x]; if (r <= 0) return submitBan(m, id, x); }
  submitBan(m, id, RESOURCES[0]);
}

export function botPick(m, id, preferred) {
  const rng = rngFor(m);
  const vis = visibleCharacters(m.bans);
  const ok = vis.filter((v) => v.status === 'ok');
  const pool = ok.length ? ok : vis;
  const choice = (preferred && pool.find((v) => v.char.id === preferred)) || rng.pick(pool);
  pickCharacter(m, id, choice.char.id);
}

export function botSignature(m, id) {
  const p = m.players[id];
  const sigs = CHAR_BY_ID[p.charId].signatures;
  if (level(p).sims) {
    const enemy = rivalOf(m, id);
    let best = sigs[0], bestScore = -Infinity;
    for (const s of sigs) {
      const score = evaluate({ ...loadout(p), sig: s.id }, loadout(enemy), m, 6);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return chooseSignature(m, id, best.id);
  }
  chooseSignature(m, id, rngFor(m).pick(sigs).id);
}

function rivalOf(m, id) {
  return m.players.find((q) => q.id !== id && q.hp > 0) || m.players[(id + 1) % m.players.length];
}

// Pure gladiators get a second resource: the one their trigger feeds best.
const PARTNER = { strike: ['bleed', 'shield', 'poison'], spell: ['arcane', 'shield', 'poison'], pain: ['armor', 'shield', 'bleed'],
  precision: ['poison', 'bleed', 'fire'], evasion: ['poison', 'shield', 'frost'] };

function plan(m, p) {
  if (p.plan) return p.plan;
  const ch = CHAR_BY_ID[p.charId];
  const rng = rngFor(m);
  const resources = ch.resources.filter((r) => !m.bans.includes(r));
  const open = RESOURCES.filter((r) => !m.bans.includes(r) && !resources.includes(r));
  while (resources.length < 2) {
    const pref = p.level === 'easy' ? [] : PARTNER[ch.trigger].filter((r) => open.includes(r));
    const pick = pref.length ? pref[0] : rng.pick(open);
    resources.push(pick);
    open.splice(open.indexOf(pick), 1);
  }
  p.plan = { trigger: ch.trigger, resources };
  return p.plan;
}

// Heuristic value of one more copy of `card` for this player.
export function scoreCard(card, p, enemy, pl, lv = LEVELS.normal) {
  const res = cardResources(card);
  const trig = card.tags.filter((t) => TRIGGERS.includes(t));
  const counts = tagCounts(p.cards);
  const have = p.cards[card.id] || 0;

  if (card.tier === 'counter') {
    if (!lv.counters) return -1;
    const ec = tagCounts(enemy.cards);
    const threat = card.counters === 'evasion' ? (ec.evasion || 0) + (CHAR_BY_ID[enemy.charId].trigger === 'evasion' ? 6 : 0) : ec[card.counters] || 0;
    if (threat < 5) return -1;
    return 3 + Math.min(5, (threat - 5) * 0.5) - have * 1.5;
  }
  if (card.tier === 'hybrid') return res.every((r) => pl.resources.includes(r)) ? 9 : -1;

  let s = 0;
  if (!lv.economy) {
    // Easy: commit to the gladiator's tags and favor higher tiers.
    for (const r of res) s += pl.resources.includes(r) ? 3 : -2.5;
    for (const t of trig) s += t === pl.trigger ? 2.5 : -1.5;
    if (typeof card.tier === 'number') s += (card.tier - 1) * 1.1;
    return s;
  }

  // Measured value of the card (see tools/cardvalue.mjs), using the value
  // for gladiators that share its tags when this one does.
  const ch = CHAR_BY_ID[p.charId];
  const v = CARD_VALUES[card.id] || { all: 0, fit: null };
  const fits = card.tags.some((t) => t === ch.trigger || ch.resources.includes(t));
  s += ((fits && v.fit !== null ? v.fit : v.all) * lv.valueWeight) / Math.sqrt(cardCost(card) / 2);
  // Plan synergy on top.
  for (const r of res) s += pl.resources.includes(r) ? lv.planWeight : -lv.planWeight * 0.6;
  for (const t of trig) s += t === pl.trigger ? lv.planWeight * 0.8 : -lv.planWeight * 0.3;

  // Cards that push a planned tag over a tier threshold are worth more.
  for (const t of card.tags) {
    if (t !== pl.trigger && !pl.resources.includes(t)) continue;
    const n = counts[t] || 0;
    for (const k of [2, 3, 4]) if (n + 1 === TIER_UNLOCK[k]) s += 1.5;
    if (pl.resources.includes(t) && n + 1 === HYBRID_REQ) s += 1;
  }
  // Pure trigger boosters only matter if the trigger is actually used.
  if (!res.length && trig.length && trig[0] !== pl.trigger) s -= 2;
  // Copies past the third give less.
  if (have >= 3) s -= 0.5 * (have - 2);
  return s;
}

// Average fight outcome of `mine` vs `theirs`: +1..+2 for wins (more for HP
// left), -1..-2 for losses (more for the enemy's HP left).
function evaluate(mine, theirs, m, n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const r = new Fight(mine, theirs, (m.seed + m.round * 977 + i * 7919) >>> 0).runToEnd();
    if (r.winner === 0) total += 1 + r.survivorHpPct;
    else if (r.winner === 1) total -= 1 + r.survivorHpPct;
  }
  return total / n;
}

export function botShop(m, id) {
  const p = m.players[id];
  const lv = level(p);
  const enemy = rivalOf(m, id);
  const pl = plan(m, p);
  const rng = rngFor(m);
  const enemyLo = loadout(enemy);
  const simulate = lv.sims > 0 && Object.keys(enemy.cards).length > 0;
  let base = simulate ? evaluate(loadout(p), enemyLo, m, lv.sims) : 0;
  let rerolls = 0;

  for (let guard = 0; guard < 40; guard++) {
    const options = [];
    p.shop.forEach((cid, i) => {
      if (!cid) return;
      const card = CARD_BY_ID[cid];
      if (cardCost(card) > p.gold || (p.cards[cid] || 0) >= card.max) return;
      options.push({ i, card, s: scoreCard(card, p, enemy, pl, lv) + (rng() - 0.5) * 2 * lv.noise });
    });
    options.sort((a, b) => b.s - a.s);

    if (simulate) {
      // Test-fight the top candidates. Long-term synergy still counts, so
      // blend the measured gain with the heuristic.
      for (const o of options.slice(0, lv.simTop)) {
        if (o.s < 1) continue;
        const cards = { ...p.cards, [o.card.id]: (p.cards[o.card.id] || 0) + 1 };
        o.gain = evaluate({ ...loadout(p), cards }, enemyLo, m, lv.sims) - base;
        o.s += o.gain * lv.simWeight;
      }
      options.sort((a, b) => b.s - a.s);
    }

    const best = options[0];
    const threshold = lv.economy && m.round <= 3 && p.gold - (best ? cardCost(best.card) : 0) < 10 && p.gold >= 8 ? 4.5 : 2.5;
    if (best && best.s > threshold) {
      buy(m, id, best.i);
      if (simulate && best.gain !== undefined) base += best.gain;
      continue;
    }
    // Reroll when nothing fits, but protect interest in the early rounds.
    const keep = lv.economy && m.round <= 4 ? 10 : 0;
    if (rerolls < lv.rerolls && p.gold - REROLL_COST >= Math.max(2, keep)) { reroll(m, id); rerolls++; continue; }
    if (rerolls < lv.rerolls && p.gold >= REROLL_COST + 2 && m.round > 4) { reroll(m, id); rerolls++; continue; }
    // Out of rerolls: unspent gold is wasted power, so take the best card
    // that at least doesn't hurt the plan (beyond what interest would earn).
    if (lv.spendAll && best && best.s > lv.spendAll && p.gold - cardCost(best.card) >= keep) {
      buy(m, id, best.i);
      if (simulate && best.gain !== undefined) base += best.gain;
      continue;
    }
    break;
  }
}
