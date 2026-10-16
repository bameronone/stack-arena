import { CARDS, CARD_BY_ID, cardResources } from '../data/cards.js';
import { CHAR_BY_ID } from '../data/characters.js';
import { TIER_UNLOCK, CARD_COST, HYBRID_REQ } from '../data/tags.js';
import { weightedPick } from '../rng.js';

export const SHOP_SIZE = 5;
export const REROLL_COST = 1;
const BASE_WEIGHT = { 1: 10, 2: 7, 3: 5, 4: 3, hybrid: 6, counter: 2.5 };

export function tagCounts(cards) {
  const counts = {};
  for (const [id, n] of Object.entries(cards)) {
    const c = CARD_BY_ID[id];
    if (!c) continue;
    for (const t of c.tags) counts[t] = (counts[t] || 0) + n;
  }
  return counts;
}

export function cardCost(card) {
  return CARD_COST[card.tier];
}

export function isBanned(card, bans) {
  if (cardResources(card).some((r) => bans.includes(r))) return true;
  if (card.counters && bans.includes(card.counters)) return true;
  return false;
}

// Why a card is (or isn't) in your pool. Used by the UI for tier progress.
export function isUnlocked(card, counts, round) {
  if (card.tier === 1) return true;
  if (card.tier === 'counter') return round >= 2;
  if (card.tier === 'hybrid') return card.tags.every((t) => (counts[t] || 0) >= HYBRID_REQ);
  const best = Math.max(0, ...card.tags.map((t) => counts[t] || 0));
  return best >= TIER_UNLOCK[card.tier];
}

export function eligibleCards(player, bans, round) {
  const counts = tagCounts(player.cards);
  return CARDS.filter((c) => !isBanned(c, bans) && (player.cards[c.id] || 0) < c.max && isUnlocked(c, counts, round));
}

export function cardWeight(card, player, counts) {
  let w = BASE_WEIGHT[card.tier];
  if (card.tags.length) {
    const avg = card.tags.reduce((s, t) => s + (counts[t] || 0), 0) / card.tags.length;
    w *= Math.min(3, 1 + 0.15 * avg);
  }
  const ch = CHAR_BY_ID[player.charId];
  if (ch && card.tags.some((t) => t === ch.trigger || ch.resources.includes(t))) w *= 1.5;
  return w;
}

export function rollShop(player, bans, round, rng) {
  const counts = tagCounts(player.cards);
  const pool = eligibleCards(player, bans, round);
  const shop = [];
  while (shop.length < SHOP_SIZE && pool.length) {
    const pick = weightedPick(rng, pool, (c) => cardWeight(c, player, counts));
    if (!pick) break;
    shop.push(pick.id);
    pool.splice(pool.indexOf(pick), 1);
  }
  return shop;
}
