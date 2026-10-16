import { makeRng } from '../rng.js';
import { CARD_BY_ID } from '../data/cards.js';
import { CHARACTERS, CHAR_BY_ID, characterStatus } from '../data/characters.js';
import { rollShop, cardCost, sellValue, REROLL_COST } from './shop.js';
import { Fight } from './combat.js';

export const START_HP = 60;
export const SIGNATURE_ROUND = 7;
export const BANS_PER_PLAYER = 1;

// Match state is plain JSON so it can be saved, snapshotted or sent over a
// network later. Players are an array so more than two can be added.
export function createMatch({ seed = Date.now() % 1e9, players }) {
  return {
    seed, nonce: 0, round: 0, phase: 'ban', bans: [], history: [],
    players: players.map((p, i) => ({
      id: i, name: p.name, isBot: !!p.isBot, charId: null, hp: START_HP, gold: 0,
      cards: {}, shop: [], locked: false, sig: null, ban: null, wins: 0,
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

export function submitBan(m, playerId, resource) {
  m.players[playerId].ban = resource;
  if (m.players.every((p) => p.ban)) {
    m.bans = [...new Set(m.players.map((p) => p.ban))];
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

export function interest(gold) {
  return Math.min(2, Math.floor(gold / 10));
}

export function startRound(m) {
  m.round++;
  for (const p of alive(m)) {
    p.gold += income(m.round) + interest(p.gold);
    if (!p.locked || p.shop.length === 0) p.shop = rollShop(p, m.bans, m.round, rngFor(m));
    p.locked = false;
  }
  m.phase = m.round === SIGNATURE_ROUND ? 'signature' : 'shop';
}

export function chooseSignature(m, playerId, sigId) {
  m.players[playerId].sig = sigId;
  if (alive(m).every((p) => p.sig)) m.phase = 'shop';
}

export function alive(m) {
  return m.players.filter((p) => p.hp > 0);
}

export function buy(m, playerId, slot) {
  const p = m.players[playerId];
  const id = p.shop[slot];
  const card = id && CARD_BY_ID[id];
  if (!card) return false;
  const cost = cardCost(card);
  if (p.gold < cost || (p.cards[id] || 0) >= card.max) return false;
  p.gold -= cost;
  p.cards[id] = (p.cards[id] || 0) + 1;
  p.shop[slot] = null;
  return true;
}

export function sell(m, playerId, cardId) {
  const p = m.players[playerId];
  if (!p.cards[cardId]) return false;
  p.cards[cardId]--;
  if (p.cards[cardId] === 0) delete p.cards[cardId];
  p.gold += sellValue(CARD_BY_ID[cardId]);
  return true;
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

export function loadout(p) {
  return { charId: p.charId, cards: { ...p.cards }, sig: p.sig };
}

// Pairings: with 2 players it's always a duel. With more, pair neighbours in
// a rotating order; an odd player out fights a copy ("ghost") of another.
export function pairings(m) {
  const live = alive(m);
  if (live.length < 2) return [];
  const order = live.map((p) => p.id);
  const shift = m.round % order.length;
  const rotated = order.slice(shift).concat(order.slice(0, shift));
  const pairs = [];
  for (let i = 0; i + 1 < rotated.length; i += 2) pairs.push([rotated[i], rotated[i + 1]]);
  if (rotated.length % 2) pairs.push([rotated[rotated.length - 1], rotated[0], 'ghost']);
  return pairs;
}

export function makeFight(m, a, b) {
  return new Fight(loadout(m.players[a]), loadout(m.players[b]), (m.seed + m.round * 31337) >>> 0);
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
  m.history.push(summary);
  for (const p of m.players) p.hp = Math.max(0, p.hp);
  return summary;
}

export function finishRound(m) {
  if (alive(m).length <= 1) {
    m.phase = 'over';
    return;
  }
  startRound(m);
}
