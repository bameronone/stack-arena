import {
  createMatch, submitBan, pickCharacter, visibleCharacters, buy, reroll, toggleLock, chooseSignature,
  resolveOtherFights, finishRound, opponentOf, alive,
} from '../engine/match.js';
import { CHAR_BY_ID } from '../data/characters.js';
import { RESOURCES } from '../data/tags.js';
import { makeRng } from '../rng.js';
import { botBan, botPick, botShop, botSignature } from '../ai/bot.js';

// The authoritative game loop. It owns the match state, runs the bots,
// enforces timers and moves between phases. A solo game is a host with no
// remote players; online, remote players' actions arrive through act() and
// every change is broadcast.
//
// Phases: ban -> pick -> (signature) -> shop -> fight -> shop ... -> over
// Timers are in seconds; shopTime 0 turns all timers off (solo only).

export const PHASE_TIME = { ban: 20, pick: 30, signature: 20, watch: 120 };
export const SHOP_TIMES = [0, 20, 30, 45];

export class HostGame {
  // players: [{ name, isBot, level }]; player 0 is the host.
  constructor({ players, seed = Math.floor(Math.random() * 1e9), shopTime = 30, now = () => Date.now() }) {
    this.now = now;
    this.listeners = new Set();
    this.M = createMatch({ seed, players });
    this.M.settings = { shopTime };
    this.M.ready = {};
    this.M.watched = {};
    this.M.lastResults = [];
    this.M.hpBefore = {};
    this.M.deadline = null;
    for (const p of this.M.players) if (p.isBot) botBan(this.M, p.id);
    this.setDeadline(PHASE_TIME.ban);
    this.advance();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const fn of this.listeners) fn(this.M); }

  // Seconds left on the current phase's clock, or null with no timer.
  remaining() {
    return this.M.deadline == null ? null : Math.max(0, (this.M.deadline - this.now()) / 1000);
  }

  setDeadline(seconds) {
    this.M.deadline = this.M.settings.shopTime ? this.now() + seconds * 1000 : null;
  }

  humans(liveOnly = false) {
    return this.M.players.filter((p) => !p.isBot && (!liveOnly || p.hp > 0));
  }

  // A player action. Returns true if it changed anything.
  act(id, action, value) {
    const m = this.M;
    const p = m.players[id];
    if (!p || p.isBot) return false;
    let ok = false;
    switch (action) {
      case 'ban':
        if (m.phase === 'ban' && !p.ban && RESOURCES.includes(value)) { submitBan(m, id, value); ok = true; }
        break;
      case 'pick':
        if (m.phase === 'pick' && !p.charId) ok = pickCharacter(m, id, value);
        break;
      case 'sig':
        if (m.phase === 'signature' && !p.sig && p.hp > 0 && CHAR_BY_ID[p.charId].signatures.some((s) => s.id === value)) {
          chooseSignature(m, id, value); ok = true;
        }
        break;
      case 'buy':
        if (m.phase === 'shop' && p.hp > 0) ok = buy(m, id, Number(value));
        break;
      case 'reroll':
        if (m.phase === 'shop' && p.hp > 0) ok = reroll(m, id);
        break;
      case 'lock':
        if (m.phase === 'shop' && p.hp > 0) { toggleLock(m, id); ok = true; }
        break;
      case 'ready':
        if (m.phase === 'shop' && p.hp > 0) { m.ready[id] = value !== false; ok = true; }
        break;
      case 'watched':
        if (m.phase === 'fight') { m.watched[id] = true; ok = true; }
        break;
    }
    if (ok) { this.advance(); this.changed(); }
    return ok;
  }

  // A human left: a bot takes over their gladiator.
  replaceWithBot(id) {
    const p = this.M.players[id];
    if (!p || p.isBot) return;
    p.isBot = true;
    p.level = 'normal';
    p.name = `${p.name} (bot)`;
    const m = this.M;
    if (m.phase === 'ban' && !p.ban) botBan(m, id);
    if (m.phase === 'pick' && !p.charId) botPick(m, id);
    if (m.phase === 'signature' && !p.sig && p.hp > 0) botSignature(m, id);
    if (m.phase === 'shop' && p.hp > 0) botShop(m, id);
    this.advance();
    this.changed();
  }

  // Called every few hundred ms; applies defaults when a clock runs out.
  tick() {
    const m = this.M;
    if (m.deadline == null || this.now() < m.deadline || m.phase === 'over') return;
    const rng = makeRng((m.seed ^ (m.round * 2654435761)) >>> 0);
    if (m.phase === 'ban') {
      for (const p of this.humans()) if (!p.ban) submitBan(m, p.id, rng.pick(RESOURCES));
    } else if (m.phase === 'pick') {
      const vis = visibleCharacters(m.bans);
      for (const p of this.humans()) if (!p.charId) pickCharacter(m, p.id, rng.pick(vis).char.id);
    } else if (m.phase === 'signature') {
      for (const p of this.humans(true)) if (!p.sig) chooseSignature(m, p.id, rng.pick(CHAR_BY_ID[p.charId].signatures).id);
    } else if (m.phase === 'shop') {
      this.runFights();
    } else if (m.phase === 'fight') {
      this.endRound();
    }
    this.advance();
    this.changed();
  }

  // Moves on whenever the current phase's requirements are met. Phase changes
  // made inside the engine (bans resolved, round started) are picked up here.
  advance() {
    const m = this.M;
    // Each round takes a few passes; with no humans left the bots play the
    // rest of the match out inside this loop.
    for (let guard = 0; guard < 5000; guard++) {
      const phase = m.phase;
      if (phase === 'pick' && this.enteredPhase !== 'pick') {
        this.enteredPhase = 'pick';
        for (const p of m.players) if (p.isBot) botPick(m, p.id);
        this.setDeadline(PHASE_TIME.pick);
        continue;
      }
      if ((phase === 'signature' || phase === 'shop') && this.enteredRound !== m.round) {
        // A new round has started.
        this.enteredRound = m.round;
        m.ready = {};
        const bots = m.players.filter((p) => p.isBot && p.hp > 0);
        if (phase === 'signature') {
          for (const p of bots) botSignature(m, p.id);
          this.setDeadline(PHASE_TIME.signature);
        }
        if (m.phase === 'shop') this.enterShop();
        continue;
      }
      if (phase === 'shop' && this.enteredShop !== m.round) { this.enterShop(); continue; }
      if (phase === 'shop') {
        const live = this.humans(true);
        if (live.length === 0 || live.every((p) => m.ready[p.id])) { this.runFights(); continue; }
      }
      if (phase === 'fight') {
        const waiting = this.watchers().filter((id) => !m.watched[id]);
        if (waiting.length === 0) { this.endRound(); continue; }
      }
      break;
    }
  }

  enterShop() {
    const m = this.M;
    this.enteredShop = m.round;
    for (const p of m.players) if (p.isBot && p.hp > 0) botShop(m, p.id);
    this.setDeadline(m.settings.shopTime || 0);
  }

  // Humans who fought this round and still need to watch their fight.
  watchers() {
    return (this.M.watchers || []).filter((id) => !this.M.players[id].isBot);
  }

  runFights() {
    const m = this.M;
    if (m.phase !== 'shop') return;
    m.hpBefore = Object.fromEntries(m.players.map((p) => [p.id, p.hp]));
    m.watchers = this.humans(true).filter((p) => opponentOf(m, p.id)).map((p) => p.id);
    m.lastResults = resolveOtherFights(m, []);
    m.phase = 'fight';
    m.watched = {};
    m.fightRound = m.round;
    this.setDeadline(PHASE_TIME.watch);
  }

  endRound() {
    const m = this.M;
    if (m.phase !== 'fight') return;
    finishRound(m);
    if (m.phase === 'over') m.deadline = null;
  }
}
