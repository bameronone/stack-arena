import { CARD_BY_ID, cardResources } from '../data/cards.js';
import { CHAR_BY_ID } from '../data/characters.js';
import { RESOURCES, TRIGGERS } from '../data/tags.js';
import { cardCost, tagCounts, REROLL_COST } from '../engine/shop.js';
import { buy, reroll, rngFor, visibleCharacters, submitBan, pickCharacter, chooseSignature } from '../engine/match.js';

// A simple opponent: commit to the character's trigger and resources, buy
// what fits, answer the enemy's main resource with counters.

export function botBan(m, id) {
  const rng = rngFor(m);
  submitBan(m, id, rng.pick(RESOURCES));
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
  const rng = rngFor(m);
  chooseSignature(m, id, rng.pick(CHAR_BY_ID[p.charId].signatures).id);
}

function plan(m, p) {
  if (p.plan) return p.plan;
  const ch = CHAR_BY_ID[p.charId];
  const rng = rngFor(m);
  const resources = ch.resources.filter((r) => !m.bans.includes(r));
  if (resources.length < 2) {
    const extra = RESOURCES.filter((r) => !m.bans.includes(r) && !resources.includes(r));
    resources.push(rng.pick(extra));
  }
  p.plan = { trigger: ch.trigger, resources };
  return p.plan;
}

export function scoreCard(card, p, enemy, plan, noise = 0) {
  const res = cardResources(card);
  const trig = card.tags.filter((t) => TRIGGERS.includes(t));
  let s = 0;
  if (card.tier === 'counter') {
    const ec = tagCounts(enemy.cards);
    return (ec[card.counters] || 0) >= 6 ? 5 + noise : -1;
  }
  if (card.tier === 'hybrid') return res.every((r) => plan.resources.includes(r)) ? 8 + noise : -1;
  for (const r of res) s += plan.resources.includes(r) ? 3 : -2;
  for (const t of trig) s += t === plan.trigger ? 2.5 : -1.5;
  if (res.length && trig.length && res.every((r) => plan.resources.includes(r)) && trig[0] === plan.trigger) s += 3;
  s += (typeof card.tier === 'number' ? card.tier - 1 : 0) * 0.8;
  return s + noise;
}

export function botShop(m, id) {
  const p = m.players[id];
  const enemy = m.players.find((q) => q.id !== id && q.hp > 0) || m.players[(id + 1) % m.players.length];
  const pl = plan(m, p);
  const rng = rngFor(m);
  let rerolls = 0;
  for (let guard = 0; guard < 40; guard++) {
    let best = -1, bestScore = 2.5;
    p.shop.forEach((cid, i) => {
      if (!cid) return;
      const card = CARD_BY_ID[cid];
      if (cardCost(card) > p.gold || (p.cards[cid] || 0) >= card.max) return;
      const s = scoreCard(card, p, enemy, pl, (rng() - 0.5));
      if (s > bestScore) { bestScore = s; best = i; }
    });
    if (best >= 0) { buy(m, id, best); continue; }
    if (p.gold >= REROLL_COST + 2 && rerolls < 5) { reroll(m, id); rerolls++; continue; }
    break;
  }
}
