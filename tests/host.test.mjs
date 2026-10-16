import test from 'node:test';
import assert from 'node:assert/strict';
import { HostGame, PHASE_TIME } from '../src/game/host.js';

const players = (n) => [{ name: 'You' }, ...Array.from({ length: n - 1 }, (_, i) => ({ name: 'B' + i, isBot: true, level: 'normal' }))];

test('solo game: phases advance on player actions, bots act on their own', () => {
  const g = new HostGame({ players: players(4), seed: 5, shopTime: 0 });
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
  assert.equal(g.M.round, 2);
  assert.equal(g.M.phase, 'shop');
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
  const g = new HostGame({ players: players(4), seed: 21, shopTime: 0 });
  g.act(0, 'ban', 'regen');
  g.act(0, 'pick', g.M.bans.includes('fire') ? 'viper' : 'cinder');
  for (let i = 0; i < 200 && g.M.phase !== 'over'; i++) {
    if (g.M.phase === 'signature') g.act(0, 'sig', g.M.players[0].charId && require0Sig(g));
    if (g.M.phase === 'shop') g.act(0, 'ready');
    if (g.M.phase === 'fight') g.act(0, 'watched');
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
