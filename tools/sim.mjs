// Headless balance simulator: plays full bot-vs-bot matches and reports
// win rates by character and by build resource.
//   node tools/sim.mjs [matches=600]
import { createMatch, pairings, makeFight, resolveFight, finishRound } from '../src/engine/match.js';
import { botBan, botPick, botShop, botSignature } from '../src/ai/bot.js';
import { CHARACTERS } from '../src/data/characters.js';

const N = Number(process.argv[2] || 600);
const charStats = Object.fromEntries(CHARACTERS.map((c) => [c.id, { games: 0, wins: 0 }]));
const resStats = {};
const cardStats = {};
let cardsEnd = 0, rounds = 0, fightTime = 0, fights = 0, draws = 0, timeouts = 0, sudden = 0;
const kinds = {};

export function playMatch(seed) {
  const m = createMatch({ seed, players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }] });
  botBan(m, 0); botBan(m, 1);
  botPick(m, 0); botPick(m, 1);
  while (m.phase !== 'over' && m.round < 40) {
    if (m.phase === 'signature') { botSignature(m, 0); botSignature(m, 1); }
    botShop(m, 0); botShop(m, 1);
    for (const [a, b, ghost] of pairings(m)) {
      const f = makeFight(m, a, b);
      const r = f.runToEnd();
      fights++; fightTime += r.time;
      if (r.winner === -1) draws++;
      if (r.time >= 89.9) timeouts++;
      if (r.time > 30) sudden++;
      for (const u of f.units) for (const [k, v] of Object.entries(u.stats.byKind)) kinds[k] = (kinds[k] || 0) + v;
      resolveFight(m, a, b, r, ghost);
    }
    finishRound(m);
  }
  return m;
}

for (let i = 0; i < N; i++) {
  const m = playMatch(1000 + i * 17);
  rounds += m.round;
  for (const p of m.players) { const n = Object.values(p.cards).reduce((a, b) => a + b, 0); cardsEnd += n; }
  const winner = m.players.find((p) => p.hp > 0);
  for (const p of m.players) {
    const won = p === winner;
    charStats[p.charId].games++;
    if (won) charStats[p.charId].wins++;
    for (const id of Object.keys(p.cards)) { cardStats[id] ??= { games: 0, wins: 0 }; cardStats[id].games++; if (won) cardStats[id].wins++; }
    for (const r of p.plan?.resources || []) {
      resStats[r] ??= { games: 0, wins: 0 };
      resStats[r].games++;
      if (won) resStats[r].wins++;
    }
  }
}

const fmt = (s) => `${((s.wins / Math.max(1, s.games)) * 100).toFixed(1).padStart(5)}%  (${s.games})`;
console.log(`matches ${N}  avg rounds ${(rounds / N).toFixed(1)}  avg fight ${(fightTime / fights).toFixed(1)}s  draws ${(draws / fights * 100).toFixed(1)}%  past-30s ${(sudden / fights * 100).toFixed(1)}%  timeouts ${(timeouts / fights * 100).toFixed(1)}%`);
console.log(`avg cards at end ${(cardsEnd / N / 2).toFixed(1)}`);
console.log('\ncharacters');
for (const [id, s] of Object.entries(charStats).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games)) console.log(`  ${id.padEnd(12)} ${fmt(s)}`);
console.log('\nbuild resources');
for (const [id, s] of Object.entries(resStats).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games)) console.log(`  ${id.padEnd(12)} ${fmt(s)}`);
const tot = Object.values(kinds).reduce((a, b) => a + b, 0);
console.log('\ndamage share');
for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${(v / tot * 100).toFixed(1)}%`);

const cs = Object.entries(cardStats).filter(([, s]) => s.games >= 40).sort((a, b) => b[1].wins / b[1].games - a[1].wins / a[1].games);
console.log('\ncards: best (owned at match end, min 40 games)');
for (const [id, s] of cs.slice(0, 8)) console.log(`  ${id.padEnd(16)} ${fmt(s)}`);
console.log('cards: worst');
for (const [id, s] of cs.slice(-8)) console.log(`  ${id.padEnd(16)} ${fmt(s)}`);
