import { makeRng } from '../rng.js';
import { CARD_BY_ID } from '../data/cards.js';
import { CHARACTERS, CHAR_BY_ID, characterStatus } from '../data/characters.js';
import { rollShop, cardCost, REROLL_COST } from './shop.js';
import { Fight } from './combat.js';

export const START_HP = 60;
export const START_GOLD = 6; // on top of round 1's income
export const SIGNATURE_ROUND = 7;
export const BAN_COUNT = 2; // resources banned per match, by vote
export const MAX_PLAYERS = 8;

// Match state is plain JSON so it can be saved, snapshotted or sent over a
// network later. Players are an array so more than two can be added.
export function createMatch({ seed = Date.now() % 1e9, players }) {
  return {
    seed, nonce: 0, round: 0, phase: 'ban', bans: [], history: [], pairs: [],
    players: players.map((p, i) => ({
      id: i, name: p.name, isBot: !!p.isBot, level: p.level || null, charId: null, hp: START_HP, gold: START_GOLD,
      cards: {}, queued: {}, shop: [], locked: false, sig: null, ban: null, wins: 0, placement: null, lastOpp: null,
    })),
  };
}

export function rngFor(m) {
  m.nonce++;
  return makeRng((m.seed * 7919 + m.nonce * 104729) >>> 0);
}

export function visibleCharacters(bans) {
  return CHARACTERS.map((c) => ({ char: c, status: characterStatus(c, bans) })).filter((x) => x.status !== 'hidden');
}

// Everyone votes to ban one resource; the BAN_COUNT most-voted are banned,
// ties broken at random. In 1v1 that is simply both players' picks.
export function submitBan(m, playerId, resource) {
  m.players[playerId].ban = resource;
  if (m.players.every((p) => p.ban)) {
    const rng = rngFor(m);
    const votes = {};
    for (const p of m.players) votes[p.ban] = (votes[p.ban] || 0) + 1;
    m.banVotes = votes;
    m.bans = Object.keys(votes)
      .map((r) => ({ r, v: votes[r], tie: rng() }))
      .sort((a, b) => b.v - a.v || a.tie - b.tie)
      .slice(0, BAN_COUNT)
      .map((x) => x.r);
    m.phase = 'pick';
  }
}

export function pickCharacter(m, playerId, charId) {
  const ch = CHAR_BY_ID[charId];
  if (!ch || characterStatus(ch, m.bans) === 'hidden') return false;
  m.players[playerId].charId = charId;
  if (m.players.every((p) => p.charId)) startRound(m);
  return true;
}

export function income(round) {
  return Math.min(10, 4 + round);
}

// Interest: +1 gold per INTEREST_STEP kept at the start of a round, up to INTEREST_MAX.
export const INTEREST_STEP = 5;
export const INTEREST_MAX = 3;
export function interest(gold) {
  return Math.min(INTEREST_MAX, Math.floor(gold / INTEREST_STEP));
}

export function startRound(m) {
  m.round++;
  for (const p of alive(m)) {
    p.gold += income(m.round) + interest(p.gold);
    if (!p.locked || p.shop.length === 0) p.shop = rollShop(p, m.bans, m.round, rngFor(m));
    p.locked = false;
  }
  m.pairs = pairings(m);
  m.phase = m.round === SIGNATURE_ROUND ? 'signature' : 'shop';
}

// This round's opponent: { id, ghost } or null.
export function opponentOf(m, id) {
  for (const [a, b, ghost] of m.pairs) {
    if (a === id) return { id: b, ghost: !!ghost };
    if (b === id && !ghost) return { id: a, ghost: false };
  }
  return null;
}

export function chooseSignature(m, playerId, sigId) {
  m.players[playerId].sig = sigId;
  if (alive(m).every((p) => p.sig)) m.phase = 'shop';
}

export function alive(m) {
  return m.players.filter((p) => p.hp > 0);
}

// Cards owned, counting ones bought during a fight that haven't landed yet.
export function ownedCount(p, id) {
  return (p.cards[id] || 0) + (p.queued?.[id] || 0);
}

// Buying while the round's fights play out is allowed, but the card waits in
// p.queued until the round ends: fights replay from the builds they started
// with, so a card can't join one halfway.
export function buy(m, playerId, slot) {
  const p = m.players[playerId];
  const id = p.shop[slot];
  const card = id && CARD_BY_ID[id];
  if (!card) return false;
  const cost = cardCost(card);
  if (p.gold < cost || ownedCount(p, id) >= card.max) return false;
  p.gold -= cost;
  const into = m.phase === 'fight' ? (p.queued ??= {}) : p.cards;
  into[id] = (into[id] || 0) + 1;
  p.shop[slot] = null;
  return true;
}

// Cards bought during the fight join the build once the round is over.
export function applyQueued(m) {
  for (const p of m.players) {
    for (const [id, n] of Object.entries(p.queued || {})) p.cards[id] = (p.cards[id] || 0) + n;
    p.queued = {};
  }
}

export function reroll(m, playerId) {
  const p = m.players[playerId];
  if (p.gold < REROLL_COST) return false;
  p.gold -= REROLL_COST;
  p.shop = rollShop(p, m.bans, m.round, rngFor(m));
  p.locked = false;
  return true;
}

export function toggleLock(m, playerId) {
  m.players[playerId].locked = !m.players[playerId].locked;
}

// round sets the fighters' HP scaling (see hpScale in combat.js).
export function loadout(p, round = 1) {
  return { charId: p.charId, cards: { ...p.cards }, sig: p.sig, round };
}

// Random pairings each round, avoiding last round's opponent where possible.
// With an odd number alive, the player left over fights a "ghost": a copy of
// another living player's build. Losing to a ghost costs HP; beating one
// doesn't hurt the player it copies.
export function pairings(m) {
  const live = alive(m).map((p) => p.id);
  if (live.length < 2) return [];
  const rng = rngFor(m);
  let best = null, bestRepeats = Infinity;
  for (let attempt = 0; attempt < 12 && bestRepeats > 0; attempt++) {
    const order = live.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const pairs = [];
    for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
    if (order.length % 2) {
      const odd = order[order.length - 1];
      const others = live.filter((x) => x !== odd);
      pairs.push([odd, others[rng.int(others.length)], 'ghost']);
    }
    const repeats = live.length > 2 ? pairs.filter(([a, b]) => m.players[a].lastOpp === b).length : 0;
    if (repeats < bestRepeats) { best = pairs; bestRepeats = repeats; }
  }
  return best;
}

export function makeFight(m, a, b) {
  return new Fight(loadout(m.players[a], m.round), loadout(m.players[b], m.round), (m.seed + m.round * 31337 + a * 101 + b * 7) >>> 0);
}

export function damageFor(round, survivorHpPct) {
  return 1 + Math.ceil(round * 0.8) + Math.round(survivorHpPct * 4);
}

// Apply a finished fight. Returns a summary for the UI.
export function resolveFight(m, a, b, result, ghost = false) {
  const pa = m.players[a], pb = m.players[b];
  let summary;
  if (result.winner === -1) {
    const d = Math.ceil(damageFor(m.round, 0) / 2);
    pa.hp -= d;
    if (!ghost) pb.hp -= d;
    summary = { round: m.round, winner: null, damage: d, time: result.time };
  } else {
    const winner = result.winner === 0 ? pa : pb;
    const loser = result.winner === 0 ? pb : pa;
    const d = damageFor(m.round, result.survivorHpPct);
    if (!(ghost && loser === pb)) loser.hp -= d;
    winner.wins++;
    summary = { round: m.round, winner: winner.id, loser: loser.id, damage: d, time: result.time };
  }
  summary.a = a; summary.b = b; summary.ghost = !!ghost;
  pa.lastOpp = b;
  if (!ghost) pb.lastOpp = a;
  m.history.push(summary);
  return summary;
}

// Plays every fight of the round except `skip` (pairs the UI animates itself).
export function resolveOtherFights(m, skip = []) {
  const out = [];
  for (const [a, b, ghost] of m.pairs) {
    if (skip.includes(a) || (!ghost && skip.includes(b))) continue;
    out.push(resolveFight(m, a, b, makeFight(m, a, b).runToEnd(), ghost));
  }
  return out;
}

// Eliminates players at 0 HP (placing them), then starts the next round or
// ends the match. Players knocked out in the same round are ranked by HP left
// (most negative is worse), then by fights won.
export function finishRound(m) {
  applyQueued(m);
  const out = m.players.filter((p) => p.hp <= 0 && p.placement === null)
    .sort((a, b) => b.hp - a.hp || b.wins - a.wins);
  let place = alive(m).length + out.length;
  for (const p of out.reverse()) p.placement = place--;
  for (const p of m.players) p.hp = Math.max(0, p.hp);
  const live = alive(m);
  if (live.length <= 1) {
    // If the last players all fell at once, the best-ranked of them already
    // holds 1st place from the ordering above.
    if (live.length === 1) live[0].placement = 1;
    m.phase = 'over';
    return;
  }
  startRound(m);
}

export function standings(m) {
  return m.players.slice().sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || b.hp - a.hp || b.wins - a.wins);
}
