import test from 'node:test';
import assert from 'node:assert/strict';
import { HostGame, PHASE_TIME } from '../src/game/host.js';
import { visibleCharacters } from '../src/engine/match.js';

const players = (n) => [{ name: 'You' }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: 'B' + i, isBot: true, level: 'normal' }))];

test('solo game: phases advance on player actions, bots act on their own', () => {
  let t = 0;
  const g = new HostGame({ players: players(4), seed: 5, shopTime: 0, now: () => t });
  assert.equal(g.M.phase, 'ban');
  assert.equal(g.remaining(), null);
  g.act(0, 'ban', 'fire');
  assert.equal(g.M.phase, 'pick');
  assert.ok(g.M.players.slice(1).every((p) => p.charId), 'bots picked');
  g.act(0, 'pick', 'viper');
  assert.equal(g.M.phase, 'shop');
  assert.equal(g.M.round, 1);
  assert.ok(g.M.players.slice(1).some((p) => Object.keys(p.cards).length), 'bots shopped');
  g.act(0, 'buy', 0);
  g.act(0, 'ready');
  assert.equal(g.M.phase, 'fight');
  assert.ok(g.M.lastResults.length >= 2);
  g.act(0, 'watched');
  assert.equal(g.M.phase, 'fight', 'the other fights are still playing out');
  t = g.M.fightsEndAt;
  g.poll();
  assert.equal(g.M.round, 2);
  assert.equal(g.M.phase, 'shop');
});

test('the round waits for every fight to play out, then moves on with no button', () => {
  let t = 0;
  const g = new HostGame({ players: [{ name: 'A' }, { name: 'B' }, ...players(4).slice(1)], seed: 8, shopTime: 30, now: () => t });
  g.act(0, 'ban', 'fire'); g.act(1, 'ban', 'frost');
  const vis = visibleCharacters(g.M.bans).map((v) => v.char.id);
  g.act(0, 'pick', vis[0]); g.act(1, 'pick', vis[1]);
  g.act(0, 'ready'); g.act(1, 'ready');
  assert.equal(g.M.phase, 'fight');
  const longest = Math.max(...g.M.lastResults.map((r) => r.time));
  // Both humans finish watching early: the bots' fights keep going.
  g.act(0, 'watched'); g.act(1, 'watched');
  t = 1000; g.poll();
  assert.equal(g.M.phase, 'fight');
  t = g.M.fightsEndAt; g.poll();
  assert.equal(g.M.phase, 'shop');
  assert.equal(g.M.round, 2);
  assert.ok(g.M.fightsEndAt >= (longest / 2) * 1000);
});

test('timers: an idle player is auto-banned, auto-picked and auto-readied', () => {
  let t = 0;
  const g = new HostGame({ players: players(3), seed: 9, shopTime: 20, now: () => t });
  assert.equal(g.remaining(), PHASE_TIME.ban);
  t += PHASE_TIME.ban * 1000; g.tick();
  assert.equal(g.M.phase, 'pick');
  t += PHASE_TIME.pick * 1000; g.tick();
  assert.equal(g.M.phase, 'shop');
  assert.ok(g.M.players[0].charId);
  t += 20 * 1000; g.tick();
  assert.equal(g.M.phase, 'fight');
  t += PHASE_TIME.watch * 1000; g.tick();
  assert.equal(g.M.round, 2);
});

test('when every human is out, the bots finish the match instantly', () => {
  let t = 0;
  const g = new HostGame({ players: players(4), seed: 21, shopTime: 0, now: () => t });
  g.act(0, 'ban', 'regen');
  g.act(0, 'pick', g.M.bans.includes('fire') ? 'viper' : 'cinder');
  for (let i = 0; i < 200 && g.M.phase !== 'over'; i++) {
    if (g.M.phase === 'signature') g.act(0, 'sig', g.M.players[0].charId && require0Sig(g));
    if (g.M.phase === 'shop') g.act(0, 'ready');
    if (g.M.phase === 'fight') { g.act(0, 'watched'); t = g.M.fightsEndAt; g.poll(); }
  }
  assert.equal(g.M.phase, 'over');
  assert.deepEqual(g.M.players.map((p) => p.placement).sort(), [1, 2, 3, 4]);
});
function require0Sig(g) {
  return { cinder: 'cinder_wild', viper: 'viper_neuro' }[g.M.players[0].charId];
}

test('a disconnected player is replaced by a bot and does not stall the round', () => {
  const g = new HostGame({ players: [{ name: 'Host' }, { name: 'Guest' }, { name: 'B', isBot: true, level: 'easy' }], seed: 3, shopTime: 0 });
  g.act(0, 'ban', 'fire');
  assert.equal(g.M.phase, 'ban', 'waits for the guest');
  g.replaceWithBot(1);
  assert.equal(g.M.phase, 'pick');
  g.act(0, 'pick', 'viper');
  assert.equal(g.M.phase, 'shop');
  g.act(0, 'ready');
  assert.equal(g.M.phase, 'fight');
});

test('cards bought during the fight are queued and only join the build when the round ends', () => {
  let t = 0;
  const g = new HostGame({ players: players(2), seed: 11, shopTime: 0, now: () => t });
  g.act(0, 'ban', 'fire');
  g.act(0, 'pick', visibleCharacters(g.M.bans)[0].char.id);
  const me = g.M.players[0];
  me.gold = 50;
  g.act(0, 'ready');
  assert.equal(g.M.phase, 'fight');
  const before = JSON.stringify(me.cards);
  const slot = me.shop.findIndex(Boolean);
  const id = me.shop[slot];
  assert.ok(g.act(0, 'buy', slot), 'buying during the fight is allowed');
  assert.equal(JSON.stringify(me.cards), before, 'the fight build is unchanged');
  assert.equal(me.queued[id], 1);
  g.act(0, 'watched');
  t = g.M.fightsEndAt; g.poll();
  if (me.hp > 0) {
    assert.equal(g.M.phase, 'shop');
    assert.ok(me.cards[id] >= 1, 'the queued card joined the build');
    assert.deepEqual(me.queued, {});
  }
});

test('knocked out: rounds keep playing out on the clock to spectate, until you skip to the end', () => {
  let t = 0;
  const g = new HostGame({ players: players(6), seed: 11, shopTime: 0, now: () => t });
  g.act(0, 'ban', 'fire');
  g.act(0, 'pick', visibleCharacters(g.M.bans)[0].char.id);
  g.M.players[0].hp = 0;
  g.act(0, 'ready', true);
  g.advance();
  assert.equal(g.M.phase, 'fight', 'a round with only bots left still plays out');
  const round = g.M.round;
  let changes = 0;
  g.onChange(() => changes++);
  t = g.M.fightsEndAt; g.poll();
  assert.equal(g.M.round, round + 1);
  assert.ok(changes > 0, 'spectators hear about the new round');
  if (g.M.phase !== 'over') {
    assert.equal(g.M.phase, 'fight', 'the next round starts straight away');
    assert.ok(g.act(0, 'skip'));
    assert.equal(g.M.phase, 'over');
  }
});
