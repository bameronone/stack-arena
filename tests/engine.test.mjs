import test from 'node:test';
import assert from 'node:assert/strict';
import { Fight } from '../src/engine/combat.js';
import { CARDS } from '../src/data/cards.js';
import { CHARACTERS, CHAR_BY_ID, characterStatus } from '../src/data/characters.js';
import { createMatch, submitBan, pickCharacter, buy, reroll, visibleCharacters } from '../src/engine/match.js';
import { eligibleCards, rollShop, isBanned } from '../src/engine/shop.js';
import { makeRng } from '../src/rng.js';
import { playMatchForTest } from './helpers.mjs';

test('fights are deterministic for a seed', () => {
  const a = { charId: 'cinder', cards: { kindling: 3, keen_edge: 2 } };
  const b = { charId: 'viper', cards: { venom_crit: 2, hemorrhage: 2 } };
  const r1 = new Fight(a, b, 42).runToEnd();
  const r2 = new Fight(a, b, 42).runToEnd();
  assert.deepEqual(r1, r2);
});

test('every fight ends within the time limit', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 60; i++) {
    const pick = () => {
      const cards = {};
      for (let k = 0; k < 15; k++) { const c = rng.pick(CARDS); cards[c.id] = Math.min(c.max, (cards[c.id] || 0) + 1); }
      return { charId: rng.pick(CHARACTERS).id, cards };
    };
    const r = new Fight(pick(), pick(), i).runToEnd();
    assert.ok(r.time <= 90.01, `fight ran ${r.time}s`);
  }
});

test('Focus: +10% per hit, reset on dodge, never two dodges in a row: about 21.5% dodges', () => {
  // Wisp has 8% innate; add Light Feet so per-hit gain is close to 10%.
  const dancer = { charId: 'wisp', cards: {} };
  const f = new Fight({ charId: 'martyr', cards: {} }, dancer, 3);
  f.b.focusGain = 0.1; f.b.maxHp = f.b.hp = 1e9; f.a.maxHp = f.a.hp = 1e9;
  let attacks = 0;
  for (let i = 0; i < 20000; i++) { f.attack(f.a); attacks++; }
  const rate = f.b.stats.dodges / attacks;
  assert.ok(rate > 0.2 && rate < 0.23, `dodge rate ${rate}`);
});

test('dodged attacks still fire the attacker\'s Strike effects', () => {
  const f = new Fight({ charId: 'cinder', cards: { kindling: 1 } }, { charId: 'wisp', cards: {} }, 1);
  f.b.focus = 1; f.b.focusCap = 1; f.b.focusReset = 1;
  f.attack(f.a);
  assert.equal(f.b.stats.dodges, 1);
  assert.ok(f.a.fire >= 2, 'Kindling and Cinder innate still granted Fire');
});

test('Toxin goes through armor but not shield', () => {
  const shielded = new Fight({ charId: 'ashen', cards: {} }, { charId: 'sage', cards: {} }, 1);
  shielded.b.shield = 500; shielded.b.poison = 10;
  const hp = shielded.b.hp;
  shielded.step(0.05);
  assert.equal(shielded.b.hp, hp);
  assert.ok(shielded.b.shield < 500);
  const armored = new Fight({ charId: 'ashen', cards: {} }, { charId: 'martyr', cards: {} }, 1);
  armored.b.armor = 100; armored.b.poison = 10;
  const hp2 = armored.b.hp;
  armored.step(0.05);
  assert.ok(Math.abs(hp2 - armored.b.hp - 0.5) < 1e-6);
});

test('gaining Fire melts Frost on you', () => {
  const f = new Fight({ charId: 'cinder', cards: {} }, { charId: 'glacia', cards: {} }, 1);
  f.a.frost = 10;
  f.gain(f.a, 'fire', 4);
  assert.equal(f.a.frost, 6);
});

test('On heal fires every 5% of base max HP healed', () => {
  const f = new Fight({ charId: 'grove', cards: { sap_ward: 1 } }, { charId: 'cinder', cards: {} }, 1);
  f.a.hp = 1;
  f.heal(f.a, f.a.baseHp * 0.11);
  assert.equal(Math.round(f.a.shield), 12);
});

test('each freeze needs 10 more Frost than the last', () => {
  const f = new Fight({ charId: 'glacia', cards: {} }, { charId: 'cinder', cards: {} }, 1);
  f.apply(f.a, 'frost', 16);
  assert.equal(f.a.stats.freezes, 1);
  f.b.frozen = 0;
  f.apply(f.a, 'frost', 20);
  assert.equal(f.a.stats.freezes, 1);
  f.apply(f.a, 'frost', 6);
  assert.equal(f.a.stats.freezes, 2);
});

test('Toxin does not cut healing', () => {
  const f = new Fight({ charId: 'grove', cards: {} }, { charId: 'ashen', cards: {} }, 1);
  f.a.hp = 1; f.a.poison = 40;
  assert.ok(Math.abs(f.heal(f.a, 50) - 50) < 1e-9);
});

test('Grit halves damage after a burst of 30% max HP in 2s', () => {
  const f = new Fight({ charId: 'cinder', cards: {} }, { charId: 'martyr', cards: {} }, 1);
  const hp = f.b.maxHp;
  f.damage(f.a, f.b, hp * 0.31, 'true');
  assert.ok(f.b.grit > 0);
  const before = f.b.hp;
  f.damage(f.a, f.b, 100, 'true');
  assert.ok(Math.abs(before - f.b.hp - 50) < 1e-9);
});

test('10 Lightning calls a bolt that grows each time', () => {
  const f = new Fight({ charId: 'stormseer', cards: {} }, { charId: 'martyr', cards: {} }, 1);
  f.b.maxHp = f.b.hp = 1e6;
  f.b.attackTimer = 0.9;
  f.gain(f.a, 'lightning', 10);
  assert.equal(f.a.bolts, 1);
  assert.equal(f.b.attackTimer, 0);
  const hp = f.b.hp;
  f.gain(f.a, 'lightning', 10);
  assert.ok(Math.abs(hp - f.b.hp - 44) < 1e-9);
});

test('mana fills smoothly between attacks', () => {
  const f = new Fight({ charId: 'cinder', cards: {} }, { charId: 'martyr', cards: {} }, 1);
  f.step(); f.step();
  assert.ok(f.a.mana > 0 && f.a.attackCount === 0);
});

test('freezing at the threshold stops attacks', () => {
  const f = new Fight({ charId: 'glacia', cards: {} }, { charId: 'cinder', cards: {} }, 1);
  f.apply(f.a, 'frost', 20);
  assert.ok(f.b.frozen > 0);
  const before = f.b.attackCount;
  for (let i = 0; i < 10; i++) f.step();
  assert.equal(f.b.attackCount, before);
});

test('characters are hidden when any of their resources is banned', () => {
  assert.equal(characterStatus(CHAR_BY_ID.cinder, ['fire']), 'hidden');
  assert.equal(characterStatus(CHAR_BY_ID.ashen, ['fire']), 'hidden');
  assert.equal(characterStatus(CHAR_BY_ID.ashen, ['fire', 'poison']), 'hidden');
  assert.equal(characterStatus(CHAR_BY_ID.ashen, ['frost', 'bleed']), 'ok');
  const vis = visibleCharacters(['fire', 'regen']).map((v) => v.char.id);
  assert.ok(!vis.includes('cinder') && !vis.includes('grove') && !vis.includes('ashen') && vis.includes('glacia'));
});

test('banned resources never appear in shops, including hybrids and counters', () => {
  const bans = ['poison', 'frost'];
  const p = { charId: 'viper', cards: { venom_coat: 0, serrated: 5, rend: 5, hemorrhage: 5 } };
  const pool = eligibleCards(p, bans, 10);
  assert.ok(pool.length > 10);
  for (const c of pool) assert.ok(!isBanned(c, bans), c.id);
  assert.ok(!pool.some((c) => c.id === 'antivenom' || c.id === 'toxic_frost'));
});

test('higher tiers unlock with tag count', () => {
  const none = eligibleCards({ charId: 'cinder', cards: {} }, [], 1);
  assert.ok(none.every((c) => c.tier === 1));
  const fire = eligibleCards({ charId: 'cinder', cards: { kindling: 5, smolder: 5, ember_heart: 5 } }, [], 5);
  assert.ok(fire.some((c) => c.id === 'phoenix'));
});

test('shop has 5 distinct cards', () => {
  const s = rollShop({ charId: 'cinder', cards: {} }, [], 1, makeRng(3));
  assert.equal(s.length, 5);
  assert.equal(new Set(s).size, 5);
});

test('match flow: ban, pick, buy, reroll', () => {
  const m = createMatch({ seed: 5, players: [{ name: 'You' }, { name: 'Bot', isBot: true }] });
  submitBan(m, 0, 'fire');
  submitBan(m, 1, 'regen');
  assert.equal(m.phase, 'pick');
  assert.equal(pickCharacter(m, 0, 'cinder'), false);
  assert.ok(pickCharacter(m, 0, 'viper'));
  assert.ok(pickCharacter(m, 1, 'glacia'));
  assert.equal(m.round, 1);
  const p = m.players[0];
  const gold = p.gold;
  assert.ok(buy(m, 0, 0));
  assert.ok(p.gold < gold);
  assert.equal(Object.values(p.cards).reduce((a, b) => a + b, 0), 1);
  assert.ok(reroll(m, 0));
});

test('full bot matches finish', () => {
  for (let s = 0; s < 20; s++) {
    const m = playMatchForTest(s);
    assert.equal(m.phase, 'over');
    assert.ok(m.players.some((p) => p.hp === 0));
  }
});

test('difficulty ladder: normal rival beats easy rival most of the time', async () => {
  const { createMatch, makeFight, resolveFight, finishRound } = await import('../src/engine/match.js');
  const { botBan, botPick, botShop, botSignature } = await import('../src/ai/bot.js');
  let normalWins = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const levels = i % 2 ? ['normal', 'easy'] : ['easy', 'normal'];
    const m = createMatch({ seed: 300 + i, players: levels.map((level) => ({ name: level, isBot: true, level })) });
    botBan(m, 0); botBan(m, 1); botPick(m, 0); botPick(m, 1);
    while (m.phase !== 'over' && m.round < 40) {
      if (m.phase === 'signature') { botSignature(m, 0); botSignature(m, 1); }
      botShop(m, 0); botShop(m, 1);
      for (const [a, b, g] of m.pairs) resolveFight(m, a, b, makeFight(m, a, b).runToEnd(), g);
      finishRound(m);
    }
    if (m.players.find((p) => p.hp > 0)?.level === 'normal') normalWins++;
  }
  assert.ok(normalWins / N > 0.7, `normal won ${normalWins}/${N}`);
});

test('8-player free-for-all: everyone gets a unique placement and bans are capped at 2', async () => {
  const { playFFA } = await import('../tools/ffa.mjs');
  for (let s = 0; s < 6; s++) {
    const m = playFFA(900 + s, 8, ['normal', 'easy']);
    assert.equal(m.phase, 'over');
    assert.deepEqual(m.players.map((p) => p.placement).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(m.bans.length <= 2 && m.bans.length >= 1);
  }
});

test('pairings: everyone alive fights once; odd counts get one ghost fight', async () => {
  const { createMatch, pairings, submitBan, pickCharacter } = await import('../src/engine/match.js');
  for (const n of [2, 3, 5, 8]) {
    const m = createMatch({ seed: 11, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, isBot: true })) });
    for (const p of m.players) submitBan(m, p.id, 'fire');
    for (const p of m.players) pickCharacter(m, p.id, 'viper');
    const pairs = pairings(m);
    const fighters = pairs.flatMap(([a, b, g]) => (g ? [a] : [a, b])).sort((x, y) => x - y);
    assert.deepEqual(fighters, Array.from({ length: n }, (_, i) => i));
    assert.equal(pairs.filter((p) => p[2]).length, n % 2);
  }
});

test('a round ends on its own once every fight has played out', async () => {
  const { HostGame, RESULTS_TIME } = await import('../src/game/host.js');
  let now = 0;
  const g = new HostGame({ players: [{ name: 'A' }, { name: 'B' }, { name: 'C', isBot: true }], seed: 4, shopTime: 20, now: () => now });
  g.act(0, 'ban', 'fire'); g.act(1, 'ban', 'frost');
  g.act(0, 'pick', 'viper'); g.act(1, 'pick', 'martyr');
  g.act(0, 'ready', true); g.act(1, 'ready', true);
  assert.equal(g.M.phase, 'fight');
  const longest = Math.max(...g.M.lastResults.map((r) => r.time));
  assert.ok(g.remaining() <= longest + RESULTS_TIME + 1e-9);
  now += (longest + RESULTS_TIME) * 1000 + 1;
  g.tick();
  assert.equal(g.M.phase, 'shop');
  assert.equal(g.M.round, 2);
});

test('a player who left gets their gladiator back from the bot', async () => {
  const { HostGame } = await import('../src/game/host.js');
  const g = new HostGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 4, shopTime: 20 });
  g.replaceWithBot(1);
  assert.ok(g.M.players[1].isBot);
  g.rejoin(1, 'B');
  assert.ok(!g.M.players[1].isBot);
  assert.equal(g.M.players[1].name, 'B');
});
