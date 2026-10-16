// Free-for-all simulation: N bots per match. Reports match length and the
// average placement of each gladiator and difficulty.
//   node tools/ffa.mjs [matches=200] [players=8] [levels=normal]   (levels: comma list, cycled)
import { createMatch, makeFight, resolveFight, finishRound } from '../src/engine/match.js';
import { botBan, botPick, botShop, botSignature } from '../src/ai/bot.js';

const N = Number(process.argv[2] || 200), P = Number(process.argv[3] || 8);
const levels = (process.argv[4] || 'normal').split(',');
let rounds = 0, ms = 0;
const byChar = {}, byLevel = {};
const add = (t, k, place) => { t[k] ??= { n: 0, sum: 0, wins: 0 }; t[k].n++; t[k].sum += place; if (place === 1) t[k].wins++; };
export function playFFA(seed, players = P, lv = levels) {
  const m = createMatch({ seed, players: Array.from({ length: players }, (_, i) => ({ name: 'B' + i, isBot: true, level: lv[i % lv.length] })) });
  for (const p of m.players) botBan(m, p.id);
  for (const p of m.players) botPick(m, p.id);
  while (m.phase !== 'over' && m.round < 60) {
    const live = m.players.filter((p) => p.hp > 0);
    if (m.phase === 'signature') for (const p of live) botSignature(m, p.id);
    for (const p of live) botShop(m, p.id);
    for (const [a, b, g] of m.pairs) resolveFight(m, a, b, makeFight(m, a, b).runToEnd(), g);
    finishRound(m);
  }
  return m;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    const m = playFFA(40000 + i * 7);
    ms += performance.now() - t;
    rounds += m.round;
    const places = m.players.map((p) => p.placement).sort((a, b) => a - b).join(',');
    if (places !== Array.from({ length: P }, (_, k) => k + 1).join(',')) throw new Error('bad placements ' + places);
    for (const p of m.players) { add(byChar, p.charId, p.placement); add(byLevel, p.level, p.placement); }
  }
  const fmt = (t) => Object.entries(t).sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n)
    .map(([k, v]) => `  ${k.padEnd(12)} avg place ${(v.sum / v.n).toFixed(2)}  wins ${((v.wins / v.n) * 100).toFixed(1)}%  (${v.n})`).join('\n');
  console.log(`${N} matches x ${P} players: avg ${(rounds / N).toFixed(1)} rounds, ${(ms / N).toFixed(0)} ms per match (expected avg place ${((P + 1) / 2).toFixed(1)})`);
  console.log('by gladiator\n' + fmt(byChar));
  if (levels.length > 1) console.log('by level\n' + fmt(byLevel));
}
