// Plays bot levels against each other (seats alternate) to check that each
// difficulty is actually stronger than the one below it.
//   node tools/duel.mjs [matches=300] [levelA=hard] [levelB=normal]
import { createMatch, pairings, makeFight, resolveFight, finishRound } from '../src/engine/match.js';
import { botBan, botPick, botShop, botSignature } from '../src/ai/bot.js';

const N = Number(process.argv[2] || 300);
const A = process.argv[3] || 'hard', B = process.argv[4] || 'normal';
let winsA = 0, shopMs = 0, shops = 0;
for (let i = 0; i < N; i++) {
  const levels = i % 2 ? [A, B] : [B, A];
  const m = createMatch({ seed: 5000 + i * 31, players: levels.map((level, k) => ({ name: 'P' + k, isBot: true, level })) });
  botBan(m, 0); botBan(m, 1); botPick(m, 0); botPick(m, 1);
  while (m.phase !== 'over' && m.round < 40) {
    if (m.phase === 'signature') { botSignature(m, 0); botSignature(m, 1); }
    for (const id of [0, 1]) {
      const t = performance.now();
      botShop(m, id);
      if (m.players[id].level === A) { shopMs += performance.now() - t; shops++; }
    }
    for (const [a, b, ghost] of pairings(m)) resolveFight(m, a, b, makeFight(m, a, b).runToEnd(), ghost);
    finishRound(m);
  }
  const winner = m.players.find((p) => p.hp > 0);
  if (winner && winner.level === A) winsA++;
}
console.log(`${A} beats ${B} in ${(winsA / N * 100).toFixed(1)}% of ${N} matches. ${A} shop turn: ${(shopMs / shops).toFixed(1)} ms avg`);
